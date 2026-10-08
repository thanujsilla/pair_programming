import { answerFontSize, answerKey, isLowConfidence, layoutAnswer, layoutAnswerSide } from './answers';
import type { AnswerKind, AnswerLabel } from './answers';
import type { Rect } from './bounds';
import { backingSize } from './coords';
import { drawStroke, INK_COLOR, sanitizeColor } from './render';
import type { StrokeStore } from './strokeStore';
import { scratchTargets } from './scratch';
import type { Point, Tool } from './types';
import { IDENTITY_VIEW, clampView, panBy, toWorld, zoomAt, type View } from './view';

/**
 * Scale (0.5..1) that lets text of `length` page units, starting at `from` and running at `angle`,
 * stay on screen. Text that cannot fit even at half size is left to run off the edge.
 */
export function fitAlong(
  from: { x: number; y: number },
  angle: number,
  length: number,
  view: View,
  width: number,
  height: number,
): number {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const left = -view.x / view.scale;
  const top = -view.y / view.scale;
  const right = (width - view.x) / view.scale;
  const bottom = (height - view.y) / view.scale;
  const room = (d: number, pos: number, lo: number, hi: number) =>
    Math.abs(d) < 1e-9 ? Infinity : d > 0 ? (hi - pos) / d : (lo - pos) / d;
  const available = Math.min(room(dx, from.x, left, right), room(dy, from.y, top, bottom));
  if (!(available > 0) || length <= available) return 1;
  return Math.max(0.5, available / length);
}

const WRITE_IN_MS = 380; // an answer is "written" onto the page from left to right
const ANSWER_FONT = '"Segoe Print", "Bradley Hand", "Chalkboard SE", "Comic Sans MS", cursive';
const ANSWER_COLORS: Record<AnswerKind, string> = {
  ok: '#b4532a',
  undefined: '#9a3b2e',
  error: 'rgba(31,29,26,0.45)',
  running: 'rgba(31,29,26,0.35)',
};

/** Context options for the live layer: the low-latency hint only where it is known to render correctly. */
export function lowLatencyCanvasOptions(
  userAgent: string = typeof navigator === 'undefined' ? '' : navigator.userAgent,
): CanvasRenderingContext2DSettings {
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
  return mobile ? {} : { desynchronized: true };
}

/**
 * The drawing engine. Plain TypeScript, no React: pointer events, rendering and
 * eraser logic never go through React state, so drawing stays at 60 FPS.
 * Three stacked canvases: `ink` (committed strokes), `overlay` (answers and
 * debug boxes) and `live` (stroke in progress plus the eraser cursor).
 * Only `live` receives input.
 */
export class InkEngine {
  private readonly store: StrokeStore;
  private readonly host: HTMLElement;
  private readonly ink: HTMLCanvasElement;
  private readonly overlay: HTMLCanvasElement;
  private readonly live: HTMLCanvasElement;
  private readonly inkCtx: CanvasRenderingContext2D;
  private readonly overlayCtx: CanvasRenderingContext2D;
  private readonly liveCtx: CanvasRenderingContext2D;

  private labels: readonly AnswerLabel[] = [];
  private boxes: readonly Rect[] = [];
  private showBoxes = false;
  private overlayDirty = true;

  private tool: Tool = 'pen';
  private width = 3;
  private color = INK_COLOR;
  private readonly eraserRadius = 12;

  private cssW = 1;
  private cssH = 1;
  private scaleX = 1;
  private scaleY = 1;

  private activePointer: number | null = null;
  private currentStroke: Point[] | null = null;
  private lastErase: Point | null = null;
  private hover: Point | null = null;

  private overlaySeen = false; // answers already on the page when it is shown are not animated
  private readonly shownAt = new Map<string, number>(); // answer key -> when it first appeared
  private readonly calm =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  private view: View = IDENTITY_VIEW;
  private viewListener: ((v: View) => void) | null = null;
  private mode: 'idle' | 'draw' | 'pan' | 'pinch' = 'idle';
  private readonly touches = new Map<number, { x: number; y: number }>(); // screen positions of fingers down
  private pinch: { dist: number; mx: number; my: number } | null = null;
  private panLast: { x: number; y: number } | null = null;

  private rafId = 0;
  private inkDirty = true;
  private liveDirty = true;

  private readonly resizeObserver: ResizeObserver;
  private readonly unsubscribe: () => void;
  private dprQuery: MediaQueryList | null = null;

  constructor(host: HTMLElement, store: StrokeStore) {
    this.host = host;
    this.store = store;

    this.ink = this.createCanvas();
    this.overlay = this.createCanvas();
    this.live = this.createCanvas();
    this.ink.style.pointerEvents = 'none';
    this.overlay.style.pointerEvents = 'none';
    this.live.style.touchAction = 'none'; // no scrolling or zooming while drawing
    this.live.style.cursor = 'crosshair';

    const inkCtx = this.ink.getContext('2d');
    const overlayCtx = this.overlay.getContext('2d');
    // `desynchronized` (low-latency hint) renders as a solid black canvas on many Android
    // phones, and the live layer covers the whole page, so use it on desktop only.
    const liveCtx = this.live.getContext('2d', lowLatencyCanvasOptions());
    if (!inkCtx || !overlayCtx || !liveCtx) throw new Error('Canvas 2D is not available');
    this.inkCtx = inkCtx;
    this.overlayCtx = overlayCtx;
    this.liveCtx = liveCtx;

    host.append(this.ink, this.overlay, this.live);

    this.live.addEventListener('pointerdown', this.onPointerDown);
    this.live.addEventListener('pointermove', this.onPointerMove);
    this.live.addEventListener('pointerup', this.onPointerUp);
    this.live.addEventListener('pointercancel', this.onPointerCancel);
    this.live.addEventListener('pointerleave', this.onPointerLeave);
    this.live.addEventListener('wheel', this.onWheel, { passive: false });

    this.unsubscribe = store.subscribe(() => {
      this.inkDirty = true;
      this.schedule();
    });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.watchDpr();
    this.resize();
  }

  setTool(tool: Tool): void {
    this.tool = tool;
    this.liveDirty = true;
    this.schedule();
  }

  setWidth(width: number): void {
    this.width = width;
  }

  /** Color for the next pen strokes; strokes already drawn keep their own color. */
  setColor(color: string): void {
    this.color = sanitizeColor(color);
    this.liveDirty = true;
    this.schedule();
  }

  /** Answers to draw next to lines, plus the line boxes used by the debug view. */
  setOverlay(labels: readonly AnswerLabel[], boxes: readonly Rect[]): void {
    // answers that just appeared are written in
    const now = performance.now();
    const keep = new Set<string>();
    for (const l of labels) {
      const key = answerKey(l);
      keep.add(key);
      if (!this.shownAt.has(key)) this.shownAt.set(key, this.overlaySeen ? now : now - WRITE_IN_MS);
    }
    this.overlaySeen = true;
    for (const key of [...this.shownAt.keys()]) if (!keep.has(key)) this.shownAt.delete(key);
    this.labels = labels;
    this.boxes = boxes;
    this.overlayDirty = true;
    this.schedule();
  }

  setShowBoxes(show: boolean): void {
    this.showBoxes = show;
    this.overlayDirty = true;
    this.schedule();
  }

  // ---------- zoom and pan ----------

  getView(): View {
    return this.view;
  }

  /** Told whenever the zoom or pan changes (the toolbar shows the zoom level). */
  setViewListener(fn: ((v: View) => void) | null): void {
    this.viewListener = fn;
  }

  setView(requested: View): void {
    const v = clampView(requested, this.cssW, this.cssH); // the page is one screen: no scrolling past its edges
    this.view = v;
    this.host.style.setProperty('--zoom', String(v.scale)); // the ruled lines follow the zoom
    this.host.style.setProperty('--pan-y', `${v.y}px`);
    this.inkDirty = true;
    this.overlayDirty = true;
    this.liveDirty = true;
    this.schedule();
    this.viewListener?.(v);
  }

  /** Zoom about the middle of the page (toolbar buttons). */
  zoomBy(factor: number): void {
    this.setView(zoomAt(this.view, factor, this.cssW / 2, this.cssH / 2));
  }

  resetView(): void {
    this.setView(IDENTITY_VIEW);
  }

  destroy(): void {
    cancelAnimationFrame(this.rafId);
    this.live.removeEventListener('pointerdown', this.onPointerDown);
    this.live.removeEventListener('pointermove', this.onPointerMove);
    this.live.removeEventListener('pointerup', this.onPointerUp);
    this.live.removeEventListener('pointercancel', this.onPointerCancel);
    this.live.removeEventListener('pointerleave', this.onPointerLeave);
    this.live.removeEventListener('wheel', this.onWheel);
    this.resizeObserver.disconnect();
    this.dprQuery?.removeEventListener('change', this.onDprChange);
    this.unsubscribe();
    this.store.endGesture();
    this.ink.remove();
    this.overlay.remove();
    this.live.remove();
  }

  // ---------- setup helpers ----------

  private createCanvas(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;display:block;';
    return c;
  }

  /** Re-fit canvases to the host size and devicePixelRatio (crisp strokes on Retina). */
  private resize(): void {
    const rect = this.host.getBoundingClientRect();
    this.cssW = Math.max(1, rect.width);
    this.cssH = Math.max(1, rect.height);
    const b = backingSize(this.cssW, this.cssH, window.devicePixelRatio);
    for (const c of [this.ink, this.overlay, this.live]) {
      // Assigning width/height clears the canvas, so only do it when the size changed.
      if (c.width !== b.width) c.width = b.width;
      if (c.height !== b.height) c.height = b.height;
    }
    this.scaleX = b.scaleX;
    this.scaleY = b.scaleY;
    if (this.view.scale > 1) this.setView(this.view); // keep the zoomed page inside the new size
    this.inkDirty = true;
    this.overlayDirty = true;
    this.liveDirty = true;
    this.schedule();
  }

  private watchDpr(): void {
    this.dprQuery?.removeEventListener('change', this.onDprChange);
    this.dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    this.dprQuery.addEventListener('change', this.onDprChange);
  }

  private onDprChange = (): void => {
    this.resize();
    this.watchDpr();
  };

  // ---------- input ----------

  /** Where the pointer is on screen, in CSS pixels inside the canvas. */
  private screenPos(e: PointerEvent, rect: DOMRect): { x: number; y: number } {
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  /** A pointer sample in page (world) coordinates: what strokes are stored in. */
  private toPoint(e: PointerEvent, rect: DOMRect): Point {
    const w = toWorld(this.view, e.clientX - rect.left, e.clientY - rect.top);
    return { x: w.x, y: w.y, t: e.timeStamp, p: e.pressure > 0 ? e.pressure : 0.5 };
  }

  /** Pen width and eraser radius are chosen on screen, so they shrink in page units as you zoom in. */
  private get worldScale(): number {
    return this.view.scale;
  }

  private onPointerDown = (e: PointerEvent): void => {
    const rect = this.live.getBoundingClientRect();
    const sp = this.screenPos(e, rect);
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, sp);
      if (this.touches.size === 2) {
        e.preventDefault();
        this.beginPinch();
        return;
      }
      if (this.touches.size > 2) return;
    }
    if (this.mode !== 'idle') return; // a second finger or a resting palm
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    this.live.setPointerCapture(e.pointerId);
    this.activePointer = e.pointerId;

    if (e.pointerType === 'mouse' && e.button === 1) {
      this.mode = 'pan';
      this.panLast = sp;
      return;
    }

    this.mode = 'draw';
    const pt = this.toPoint(e, rect);
    this.hover = pt;
    if (this.tool === 'pen') {
      this.currentStroke = [pt];
    } else {
      this.store.beginGesture();
      this.lastErase = pt;
      this.eraseAt(pt);
    }
    this.liveDirty = true;
    this.schedule();
  };

  /** Two fingers: whatever was being drawn is dropped, and the fingers zoom and pan the page. */
  private beginPinch(): void {
    if (this.mode === 'draw') {
      if (this.tool !== 'pen') this.store.endGesture();
      this.currentStroke = null;
      this.lastErase = null;
    }
    this.mode = 'pinch';
    this.activePointer = null;
    this.panLast = null;
    const [a, b] = [...this.touches.values()] as [{ x: number; y: number }, { x: number; y: number }];
    this.pinch = { dist: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    this.liveDirty = true;
    this.schedule();
  }

  private updatePinch(): void {
    if (!this.pinch || this.touches.size !== 2) return;
    const [a, b] = [...this.touches.values()] as [{ x: number; y: number }, { x: number; y: number }];
    const dist = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    let v = zoomAt(this.view, dist / this.pinch.dist, mx, my);
    v = panBy(v, mx - this.pinch.mx, my - this.pinch.my);
    this.pinch = { dist, mx, my };
    this.setView(v);
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const rect = this.live.getBoundingClientRect();
    const unit = e.deltaMode === 1 ? 16 : 1;
    if (e.ctrlKey || e.metaKey) {
      // Ctrl + wheel, or a trackpad pinch (browsers report it as ctrl + wheel)
      const d = Math.max(-50, Math.min(50, e.deltaY * unit));
      this.setView(zoomAt(this.view, Math.exp(-d * 0.01), e.clientX - rect.left, e.clientY - rect.top));
    } else {
      this.setView(panBy(this.view, -e.deltaX * unit, -e.deltaY * unit));
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    const rect = this.live.getBoundingClientRect();
    const sp = this.screenPos(e, rect);
    if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) this.touches.set(e.pointerId, sp);

    if (this.mode === 'pinch') {
      this.updatePinch();
      return;
    }
    if (e.pointerId !== this.activePointer) {
      if (this.activePointer === null && e.pointerType !== 'touch') {
        this.hover = this.toPoint(e, rect); // eraser cursor follows the mouse or pen
        this.liveDirty = true;
        this.schedule();
      }
      return;
    }
    if (this.mode === 'pan') {
      const last = this.panLast ?? sp;
      this.setView(panBy(this.view, sp.x - last.x, sp.y - last.y));
      this.panLast = sp;
      return;
    }

    // Coalesced events carry every sample the hardware reported between frames.
    const coalesced = e.getCoalescedEvents?.() ?? [];
    const events = coalesced.length > 0 ? coalesced : [e];
    const minStep = 0.5 / this.worldScale;
    for (const ev of events) {
      const pt = this.toPoint(ev, rect);
      if (this.tool === 'pen' && this.currentStroke) {
        const last = this.currentStroke[this.currentStroke.length - 1] as Point;
        if (Math.hypot(pt.x - last.x, pt.y - last.y) >= minStep) this.currentStroke.push(pt);
      } else if (this.lastErase) {
        this.eraseAlong(this.lastErase, pt);
        this.lastErase = pt;
      }
      this.hover = pt;
    }
    this.liveDirty = true;
    this.schedule();
  };

  private onPointerUp = (e: PointerEvent): void => this.release(e, true);

  private onPointerCancel = (e: PointerEvent): void => this.release(e, false);

  private release(e: PointerEvent, commit: boolean): void {
    this.touches.delete(e.pointerId);
    if (this.mode === 'pinch') {
      if (this.touches.size < 2) {
        this.mode = 'idle';
        this.pinch = null;
      }
      return;
    }
    if (e.pointerId !== this.activePointer) return;
    if (this.mode === 'pan') {
      this.mode = 'idle';
      this.panLast = null;
      this.activePointer = null;
      return;
    }
    this.finish(commit);
  }

  private onPointerLeave = (e: PointerEvent): void => {
    if (this.activePointer === null && e.pointerId !== undefined) {
      this.hover = null;
      this.liveDirty = true;
      this.schedule();
    }
  };

  private finish(commit: boolean): void {
    if (this.tool === 'pen') {
      const scratched = commit && this.currentStroke
        ? scratchTargets(this.currentStroke, this.store.strokes, 24 / this.worldScale)
        : new Set<string>();
      if (scratched.size > 0) {
        // a scribble over ink scratches it out (one undo step) instead of adding the scribble
        this.store.removeStrokes(scratched);
      } else if (commit && this.currentStroke) {
        this.store.addStroke({
          id: this.store.nextId(),
          points: this.currentStroke,
          width: this.width / this.worldScale,
          color: this.color,
        });
      }
    } else {
      this.store.endGesture();
    }
    this.currentStroke = null;
    this.lastErase = null;
    this.activePointer = null;
    this.mode = 'idle';
    this.liveDirty = true;
    this.schedule();
  }

  private eraseAt(p: Point): void {
    const r = this.eraserRadius / this.worldScale;
    if (this.tool === 'strokeEraser') this.store.eraseStrokesAt(p.x, p.y, r);
    else this.store.erasePixelsAt(p.x, p.y, r);
  }

  /** Walk the eraser between two samples so fast drags cannot skip over ink. */
  private eraseAlong(from: Point, to: Point): void {
    const r = this.eraserRadius / this.worldScale;
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (r / 2)));
    for (let k = 1; k <= steps; k++) {
      const f = k / steps;
      this.eraseAt({ ...to, x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f });
    }
  }

  // ---------- rendering (requestAnimationFrame, only when dirty) ----------

  private schedule(): void {
    if (this.rafId === 0) this.rafId = requestAnimationFrame(this.frame);
  }

  private frame = (): void => {
    this.rafId = 0;
    if (this.inkDirty) {
      this.inkDirty = false;
      this.drawInk();
    }
    if (this.overlayDirty) {
      this.overlayDirty = false;
      this.drawOverlay();
    }
    if (this.liveDirty) {
      this.liveDirty = false;
      this.drawLive();
    }
  };

  /** Clear the whole canvas, then draw in page coordinates (zoomed and panned). */
  private beginDraw(ctx: CanvasRenderingContext2D): void {
    ctx.setTransform(this.scaleX, 0, 0, this.scaleY, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    const v = this.view;
    ctx.setTransform(this.scaleX * v.scale, 0, 0, this.scaleY * v.scale, this.scaleX * v.x, this.scaleY * v.y);
  }

  private drawInk(): void {
    const ctx = this.inkCtx;
    this.beginDraw(ctx);
    for (const s of this.store.strokes) drawStroke(ctx, s.points, s.width, sanitizeColor(s.color));
  }

  private drawOverlay(): void {
    const ctx = this.overlayCtx;
    this.beginDraw(ctx);
    const scale = this.view.scale;

    if (this.showBoxes) {
      ctx.save();
      ctx.strokeStyle = 'rgba(40,110,200,0.6)';
      ctx.lineWidth = 1 / scale;
      ctx.setLineDash([5 / scale, 4 / scale]);
      for (const r of this.boxes) {
        ctx.strokeRect(r.left - 4, r.top - 4, r.right - r.left + 8, r.bottom - r.top + 8);
      }
      ctx.restore();
    }

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const visibleRight = (this.cssW - this.view.x) / scale; // right edge of the screen, in page units
    const now = performance.now();
    let animating = false;
    for (const label of this.labels) {
      const size = answerFontSize(label.anchor, label.glyphHeight);
      ctx.font = `${size}px ${ANSWER_FONT}`;
      const width = ctx.measureText(label.text).width;
      const low = isLowConfidence(label);

      // Normally just right of the line. A line written in another direction gets its answer after
      // the "=", running the same way, turned like the "=" itself.
      const along = label.from !== undefined && label.angle !== undefined && label.angle !== 0;
      const origin = along
        ? { x: (label.from as { x: number }).x, y: (label.from as { y: number }).y }
        : label.side
          ? layoutAnswerSide(label.anchor, size, label.side)
          : layoutAnswer(label.anchor, width, visibleRight, size);
      const turn = along ? (label.angle as number) : 0;

      const age = now - (this.shownAt.get(answerKey(label)) ?? now);
      const t = this.calm ? 1 : Math.min(1, age / WRITE_IN_MS);
      const eased = 1 - (1 - t) ** 3;
      if (t < 1) animating = true;

      // an answer running off the screen is shrunk (to at most half) to fit the room left in its direction
      const fit = along ? fitAlong(origin, turn, width, this.view, this.cssW, this.cssH) : 1;

      ctx.save();
      ctx.translate(origin.x, origin.y);
      ctx.rotate(turn);
      ctx.scale(fit, fit);
      if (t < 1) {
        // reveal from left to right, like a pen writing it
        ctx.beginPath();
        ctx.rect(-6, -size, (width + size) * eased + 6, size * 2);
        ctx.clip();
      }
      ctx.fillStyle = ANSWER_COLORS[label.kind];
      ctx.globalAlpha = low ? 0.55 : 1;
      ctx.fillText(label.text, 0, 0);
      if (low) {
        // unsure: a dashed underline and a "?" ask the user to check the handwriting
        ctx.globalAlpha = 0.7;
        ctx.font = `${size * 0.7}px ${ANSWER_FONT}`;
        ctx.fillText('?', width + 4 / scale, -size * 0.15);
        ctx.setLineDash([5 / scale, 4 / scale]);
        ctx.lineWidth = 1.5 / scale;
        ctx.strokeStyle = ANSWER_COLORS[label.kind];
        ctx.beginPath();
        ctx.moveTo(0, size * 0.55);
        ctx.lineTo(width, size * 0.55);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (animating) {
      this.overlayDirty = true;
      this.schedule();
    }
  }

  private drawLive(): void {
    const ctx = this.liveCtx;
    this.beginDraw(ctx);
    const scale = this.view.scale;
    if (this.tool === 'pen') {
      if (this.currentStroke) drawStroke(ctx, this.currentStroke, this.width / scale, this.color);
    } else if (this.hover && this.mode !== 'pinch') {
      ctx.beginPath();
      ctx.arc(this.hover.x, this.hover.y, this.eraserRadius / scale, 0, Math.PI * 2);
      ctx.lineWidth = 1.5 / scale;
      ctx.strokeStyle = 'rgba(31,29,26,0.55)';
      ctx.setLineDash([4 / scale, 3 / scale]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}