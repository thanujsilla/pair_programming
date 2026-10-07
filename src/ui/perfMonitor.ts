export interface FrameSummary {
  fps: number;
  worstFrameMs: number;
  droppedFrames: number;
}

const FRAME_MS = 1000 / 60;

/** Turn a list of gaps between animation frames (ms) into fps / worst gap / dropped frames. */
export function summarizeFrames(deltas: readonly number[]): FrameSummary {
  if (deltas.length === 0) return { fps: 0, worstFrameMs: 0, droppedFrames: 0 };
  let total = 0;
  let worst = 0;
  let dropped = 0;
  for (const d of deltas) {
    total += d;
    if (d > worst) worst = d;
    if (d > 25) dropped += Math.max(0, Math.round(d / FRAME_MS) - 1);
  }
  return {
    fps: total > 0 ? (deltas.length * 1000) / total : 0,
    worstFrameMs: worst,
    droppedFrames: dropped,
  };
}

export interface PerfSnapshot extends FrameSummary {
  longTasks: number;
}

/** Measures real frame pacing over a sliding window. Costs almost nothing while stopped. */
export class PerfMonitor {
  private readonly windowMs: number;
  private frames: { t: number; d: number }[] = [];
  private longs: number[] = [];
  private raf = 0;
  private last = 0;
  private observer: PerformanceObserver | null = null;

  constructor(windowMs = 3000) {
    this.windowMs = windowMs;
  }

  start(): void {
    if (this.raf) return;
    this.last = 0;
    const tick = (now: number) => {
      if (this.last) this.frames.push({ t: now, d: now - this.last });
      this.last = now;
      this.trim(now);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);

    try {
      this.observer = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) this.longs.push(e.startTime);
      });
      this.observer.observe({ entryTypes: ['longtask'] });
    } catch {
      this.observer = null; // not supported in this browser: long-task count stays 0
    }
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.observer?.disconnect();
    this.observer = null;
    this.frames = [];
    this.longs = [];
  }

  snapshot(): PerfSnapshot {
    const now = performance.now();
    this.trim(now);
    return { ...summarizeFrames(this.frames.map((f) => f.d)), longTasks: this.longs.length };
  }

  private trim(now: number): void {
    const cutoff = now - this.windowMs;
    let i = 0;
    while (i < this.frames.length && this.frames[i].t < cutoff) i++;
    if (i > 0) this.frames.splice(0, i);
    let j = 0;
    while (j < this.longs.length && this.longs[j] < cutoff) j++;
    if (j > 0) this.longs.splice(0, j);
  }
}