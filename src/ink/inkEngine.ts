import { answerFontSize, layoutAnswer } from './answers';
import type { AnswerKind, AnswerLabel } from './answers';
import type { Rect } from './bounds';
import { backingSize } from './coords';
import { drawStroke, INK_COLOR, sanitizeColor } from './render';
import type { StrokeStore } from './strokeStore';
import type { Point, Tool } from './types';

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

  destroy(): void {
    cancelAnimationFrame(this.rafId);
    this.live.removeEventListener('pointerdown', this.onPointerDown);
    this.live.removeEventListener('pointermove', this.onPointerMove);
    this.live.removeEventListener('pointerup', this.onPointerUp);
    this.live.removeEventListener('pointercancel', this.onPointerCancel);
    this.live.removeEventListener('pointerleave', this.onPointerLeave);
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

  private toPoint(e: PointerEvent, rect: DOMRect): Point {
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      t: e.timeStamp,
      p: e.pressure > 0 ? e.pressure : 0.5,
    };
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (this.activePointer !== null) return; // ignore a second finger or a resting palm
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    this.live.setPointerCapture(e.pointerId);
    this.activePointer = e.pointerId;

    const pt = this.toPoint(e, this.live.getBoundingClientRect());
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

  private onPointerMove = (e: PointerEvent): void => {
    const rect = this.live.getBoundingClientRect();
    if (e.pointerId !== this.activePointer) {
      if (this.activePointer === null && e.pointerType !== 'touch') {
        this.hover = this.toPoint(e, rect); // eraser cursor follows the mouse or pen
        this.liveDirty = true;
        this.schedule();
      }
      return;
    }

    // Coalesced events carry every sample the hardware reported between frames.
    const coalesced = e.getCoalescedEvents?.() ?? [];
    const events = coalesced.length > 0 ? coalesced : [e];
    for (const ev of events) {
      const pt = this.toPoint(ev, rect);
      if (this.tool === 'pen' && this.currentStroke) {
        const last = this.currentStroke[this.currentStroke.length - 1] as Point;
        if (Math.hypot(pt.x - last.x, pt.y - last.y) >= 0.5) this.currentStroke.push(pt);
      } else if (this.lastErase) {
        this.eraseAlong(this.lastErase, pt);
        this.lastErase = pt;
      }
      this.hover = pt;
    }
    this.liveDirty = true;
    this.schedule();
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerId === this.activePointer) this.finish(true);
  };

  private onPointerCancel = (e: PointerEvent): void => {
    if (e.pointerId === this.activePointer) this.finish(false);
  };

  private onPointerLeave = (e: PointerEvent): void => {
    if (this.activePointer === null && e.pointerId !== undefined) {
      this.hover = null;
      this.liveDirty = true;
      this.schedule();
    }
  };

  private finish(commit: boolean): void {
    if (this.tool === 'pen') {
      if (commit && this.currentStroke) {
        this.store.addStroke({
          id: this.store.nextId(),
          points: this.currentStroke,
          width: this.width,
          color: this.color,
        });
      }
    } else {
      this.store.endGesture();
    }
    this.currentStroke = null;
    this.lastErase = null;
    this.activePointer = null;
    this.liveDirty = true;
    this.schedule();
  }

  private eraseAt(p: Point): void {
    if (this.tool === 'strokeEraser') this.store.eraseStrokesAt(p.x, p.y, this.eraserRadius);
    else this.store.erasePixelsAt(p.x, p.y, this.eraserRadius);
  }

  /** Walk the eraser between two samples so fast drags cannot skip over ink. */
  private eraseAlong(from: Point, to: Point): void {
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (this.eraserRadius / 2)));
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

  private drawInk(): void {
    const ctx = this.inkCtx;
    ctx.setTransform(this.scaleX, 0, 0, this.scaleY, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    for (const s of this.store.strokes) drawStroke(ctx, s.points, s.width, sanitizeColor(s.color));
  }

  private drawOverlay(): void {
    const ctx = this.overlayCtx;
    ctx.setTransform(this.scaleX, 0, 0, this.scaleY, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);

    if (this.showBoxes) {
      ctx.save();
      ctx.strokeStyle = 'rgba(40,110,200,0.6)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      for (const r of this.boxes) {
        ctx.strokeRect(r.left - 4, r.top - 4, r.right - r.left + 8, r.bottom - r.top + 8);
      }
      ctx.restore();
    }

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    for (const label of this.labels) {
      const size = answerFontSize(label.anchor, label.glyphHeight);
      ctx.font = `${size}px ${ANSWER_FONT}`;
      const pos = layoutAnswer(label.anchor, ctx.measureText(label.text).width, this.cssW, size);
      ctx.fillStyle = ANSWER_COLORS[label.kind];
      ctx.fillText(label.text, pos.x, pos.y);
    }
  }

  private drawLive(): void {
    const ctx = this.liveCtx;
    ctx.setTransform(this.scaleX, 0, 0, this.scaleY, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    if (this.tool === 'pen') {
      if (this.currentStroke) drawStroke(ctx, this.currentStroke, this.width, this.color);
    } else if (this.hover) {
      ctx.beginPath();
      ctx.arc(this.hover.x, this.hover.y, this.eraserRadius, 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(31,29,26,0.55)';
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}