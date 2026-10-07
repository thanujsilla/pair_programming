import type { AnswerLabel } from '../ink/answers';
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
        // a tilted line gets its answer beside the "=" at its end, at the size of its digits
        const place =
          line.angle === 0
            ? { anchor: line.bounds }
            : { anchor: line.endBounds, glyphHeight: line.glyphHeight };
        if (r.status === 'ok') out.push({ text: r.value, kind: 'ok', ...place });
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