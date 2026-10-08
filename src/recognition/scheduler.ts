import type { Line } from '../ink/lineGrouper';
import { calculate } from '../math';
import type { EvalResult } from '../math';
import type { Recognizer } from './types';
import { pickReading, variantsOf, type Reading, type Variant } from './variants';

export type LineStatus =
  | { state: 'idle' } // changed, waiting for the pen to rest
  | { state: 'running' } // recognizer is working on it right now
  | { state: 'done'; text: string; result: EvalResult; confidence?: number; kind?: Variant['kind'] }
  | { state: 'failed' };

type Settled = Extract<LineStatus, { state: 'done' | 'failed' }>;

const CACHE_LIMIT = 200;

export interface SchedulerOptions {
  /** quiet time after the last change before recognizing (default 400 ms) */
  debounceMs?: number;
  /** called whenever a line's status changes */
  onChange: () => void;
}

/**
 * Decides when and what to recognize:
 *  - debounce: wait until the user pauses
 *  - dirty lines only: results are cached by line signature, so only changed lines are re-run
 *  - one request at a time: the recognizer is never flooded
 *  - epoch check: a result that arrives after invalidate() is thrown away
 */
export class RecognitionScheduler {
  private readonly recognizer: Recognizer;
  private readonly debounceMs: number;
  private readonly onChange: () => void;

  private cache = new Map<string, Settled>();
  private lines: readonly Line[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private runningSignature: string | null = null;
  private lastMs: number | null = null;
  private epoch = 0;
  private disposed = false;

  constructor(recognizer: Recognizer, options: SchedulerOptions) {
    this.recognizer = recognizer;
    this.debounceMs = options.debounceMs ?? 400;
    this.onChange = options.onChange;
  }

  /** How long the most recent recognition took, in ms (null until one has finished). */
  get lastDurationMs(): number | null {
    return this.lastMs;
  }

  /** Call whenever the lines change. */
  update(lines: readonly Line[]): void {
    this.lines = lines;
    this.arm();
  }

  /** Forget every result and recognize again (used when the recognizer's behaviour changes). */
  invalidate(): void {
    this.epoch++;
    this.cache.clear();
    this.arm();
    this.onChange();
  }

  statusOf(line: Line): LineStatus {
    if (this.runningSignature === line.signature) return { state: 'running' };
    return this.cache.get(line.signature) ?? { state: 'idle' };
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private needsWork(): boolean {
    return this.lines.some((l) => !this.cache.has(l.signature));
  }

  private arm(): void {
    this.clearTimer();

    if (this.disposed || !this.needsWork()) return;

    this.timer = setTimeout(() => {
      this.timer = null;
      void this.pump();
    }, this.debounceMs);
  }

  private async pump(): Promise<void> {
    if (this.disposed || this.runningSignature !== null) return;

    const line = this.lines.find((l) => !this.cache.has(l.signature));
    if (!line) return;

    const epoch = this.epoch;
    this.runningSignature = line.signature;
    this.onChange();

    let settled: Settled;
    const started = performance.now();

    try {
      // A line that is not level is presented to the model in more than one way (turned, and levelled
      // with the digits kept upright); the reading it is surest of is kept.
      const readings: Reading[] = [];
      for (const v of variantsOf(line.strokes, line.angle)) {
        const out = await this.recognizer.recognize({ lineIndex: line.index, strokes: v.strokes });
        readings.push({ kind: v.kind, out, result: calculate(out.text) });
      }
      const chosen = pickReading(readings);
      const out = chosen.out;
      settled = {
        state: 'done',
        text: out.text,
        result: chosen.result,
        kind: chosen.kind,
        ...(out.confidence === undefined ? {} : { confidence: out.confidence }),
      };
    } catch {
      settled = { state: 'failed' }; // cached, so a failing line is not retried in a loop
    }

    if (this.disposed) return;

    this.lastMs = performance.now() - started;

    this.runningSignature = null;

    if (epoch !== this.epoch) {
      this.arm(); // stale result: discard it and start over
      this.onChange();
      return;
    }

    this.remember(line.signature, settled);
    this.onChange();

    // Keep going with the next changed line, unless the user is drawing again
    // (in that case the debounce timer is already running).
    if (this.timer === null) void this.pump();
  }

  private remember(signature: string, value: Settled): void {
    this.cache.delete(signature);
    this.cache.set(signature, value);

    while (this.cache.size > CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }
}