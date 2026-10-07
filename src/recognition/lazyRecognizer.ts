import type { RecognitionResult, RecognizeInput, Recognizer } from './types';
import { WorkerRecognizer } from './workerRecognizer';
import type { WorkerLike, WorkerRecognizerOptions } from './workerRecognizer';

/**
 * The recognizer the app holds on to. The worker (and the model inside it) starts on first use
 * or on `warmUp()`, and starts again if the recognizer was disposed. React's development mode
 * disposes and re-mounts once, so being restartable matters. Also remembers the last failure,
 * so the page can tell the person when the model could not load.
 */
export class LazyWorkerRecognizer implements Recognizer {
  readonly id: string;
  version = 0;

  private readonly createWorker: () => WorkerLike;
  private readonly options: WorkerRecognizerOptions;
  private remote: WorkerRecognizer | null = null;
  private failure: string | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(createWorker: () => WorkerLike, options: WorkerRecognizerOptions) {
    this.id = `lazy:${options.kind}`;
    this.createWorker = createWorker;
    this.options = options;
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };

  /** What went wrong the last time the model was loaded or used, or null. */
  lastError(): string | null {
    return this.failure;
  }

  /** Start loading the model now, so the first line does not wait for it. */
  warmUp(): void {
    const r = this.start();
    r.ready.catch((e) => this.fail(r, e));
  }

  async recognize(input: RecognizeInput): Promise<RecognitionResult> {
    const r = this.start();
    try {
      const out = await r.recognize(input);
      if (this.failure !== null && this.remote === r) this.setFailure(null);
      return out;
    } catch (e) {
      this.fail(r, e);
      throw e;
    }
  }

  /** Safe to call more than once. */
  dispose(): void {
    this.remote?.dispose();
    this.remote = null;
    this.failure = null;
  }

  private start(): WorkerRecognizer {
    if (!this.remote) this.remote = new WorkerRecognizer(this.createWorker(), this.options);
    return this.remote;
  }

  private fail(from: WorkerRecognizer, e: unknown): void {
    if (this.remote !== from) return; // a worker that has already been replaced
    this.setFailure(e instanceof Error ? e.message : String(e));
  }

  private setFailure(message: string | null): void {
    this.failure = message;
    this.version++;
    for (const fn of this.listeners) fn();
  }
}