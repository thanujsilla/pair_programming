import { ANSWER_GAP, type AnswerLabel } from '../ink/answers';
import { groupLines, type Line } from '../ink/lineGrouper';
import type { StrokeStore } from '../ink/strokeStore';
import { RecognitionScheduler } from './scheduler';
import type { Recognizer } from './types';

/**
 * Glue: strokes -> lines -> (debounced) recognition -> evaluated answers.
 * Subscribe to be told when lines or answers change.
 */
export class Pipeline {
  version = 0;
  lines: readonly Line[] = [];

  private readonly store: StrokeStore;
  private readonly scheduler: RecognitionScheduler;
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribeStore: () => void;

  constructor(store: StrokeStore, recognizer: Recognizer, options: { debounceMs?: number } = {}) {
    this.store = store;
    this.scheduler = new RecognitionScheduler(recognizer, {
      debounceMs: options.debounceMs,
      onChange: () => this.emit(),
    });
    this.unsubscribeStore = store.subscribe(() => this.refresh());
    this.refresh();
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  /** How long the last recognition took (ms), or null if none has finished yet. */
  get lastRecognitionMs(): number | null {
    return this.scheduler.lastDurationMs;
  }

  /** Re-recognize every line (the recognizer's behaviour changed). */
  invalidate(): void {
    this.scheduler.invalidate();
  }

  /** The answers to draw: one per line that has something to show. */
  labels(): AnswerLabel[] {
    const out: AnswerLabel[] = [];
    for (const line of this.lines) {
      const status = this.scheduler.statusOf(line);
      // while the model is still reading, nothing is drawn: only the final answer appears
      if (status.state === 'done') {
        const r = status.result;
        // The answer sits after the "=" (at its middle height) and is as big as the handwriting. A line that is
        // not written left to right gets its answer turned like the "="; a column of upright glyphs gets an
        // upright answer below (or above) its "=".
        const size = { glyphHeight: line.glyphHeight };
        let place: Partial<AnswerLabel> & { anchor: AnswerLabel['anchor'] };
        if (line.angle === 0) place = { anchor: line.endBounds, ...size };
        else if (status.kind === 'stack') {
          place = { anchor: line.endBounds, ...size, side: line.angle > 0 ? 'below' : 'above' };
        } else {
          const dx = Math.cos(line.angle);
          const dy = Math.sin(line.angle);
          place = {
            anchor: line.endBounds,
            ...size,
            from: { x: line.tail.x + dx * ANSWER_GAP, y: line.tail.y + dy * ANSWER_GAP },
            angle: line.angle,
          };
        }
        const sure = status.confidence === undefined ? {} : { confidence: status.confidence };
        if (r.status === 'ok') out.push({ text: r.value, kind: 'ok', ...place, ...sure });
        else if (r.status === 'undefined') out.push({ text: 'Undefined', kind: 'undefined', ...place });
        else if (r.status === 'error') out.push({ text: '?', kind: 'error', ...place });
        // 'incomplete' (no "=" yet): show nothing
      }
    }
    return out;
  }

  destroy(): void {
    this.unsubscribeStore();
    this.scheduler.dispose();
    this.listeners.clear();
  }

  private refresh(): void {
    this.lines = groupLines(this.store.strokes);
    this.scheduler.update(this.lines);
    this.emit();
  }

  private emit(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }
}