import type { RecognitionResult, RecognizeInput, Recognizer } from './types';
import type { WorkerRequest, WorkerResponse } from './workerProtocol';

/** What WorkerRecognizer needs from a worker. Real workers are wrapped by webWorkerAdapter. */
export interface WorkerLike {
  postMessage(message: WorkerRequest): void;
  terminate(): void;
  listen(onMessage: (message: WorkerResponse) => void, onError: (message: string) => void): void;
}

export function webWorkerAdapter(worker: Worker): WorkerLike {
  return {
    postMessage: (message) => worker.postMessage(message),
    terminate: () => worker.terminate(),
    listen: (onMessage, onError) => {
      worker.addEventListener('message', (e: MessageEvent<WorkerResponse>) => onMessage(e.data));
      worker.addEventListener('error', (e: ErrorEvent) => onError(e.message || 'Worker crashed'));
      worker.addEventListener('messageerror', () => onError('Worker message could not be read'));
    },
  };
}

export interface WorkerRecognizerOptions {
  /** which recognizer to start inside the worker (a key of the worker's registry) */
  kind: string;
  options?: unknown;
  /** give up on a request after this long (default 30 s) */
  timeoutMs?: number;
}

interface Pending {
  resolve: (r: RecognitionResult) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Looks like any other Recognizer, but the work happens in a Web Worker, so
 * the page's main thread (drawing, pointer events) is never blocked.
 */
export class WorkerRecognizer implements Recognizer {
  readonly id: string;
  /** resolves when the worker has loaded its recognizer; rejects if that fails */
  readonly ready: Promise<void>;

  private readonly worker: WorkerLike;
  private readonly timeoutMs: number;
  private readonly settleReady: { resolve: () => void; reject: (e: Error) => void };
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  private broken: Error | null = null;
  private disposed = false;

  constructor(worker: WorkerLike, options: WorkerRecognizerOptions) {
    this.id = `worker:${options.kind}`;
    this.worker = worker;
    this.timeoutMs = options.timeoutMs ?? 30_000;

    let settle = { resolve: () => {}, reject: () => {} };
    this.ready = new Promise<void>((resolve, reject) => {
      settle = { resolve, reject };
    });
    this.settleReady = settle;
    this.ready.catch(() => {}); // callers may never look at it

    worker.listen(
      (message) => this.onMessage(message),
      (message) => this.fail(new Error(message)),
    );
    // Start loading right away, so a model is warm before the first line is drawn.
    worker.postMessage({ type: 'init', kind: options.kind, options: options.options });
  }

  configure(config: unknown): void {
    if (this.disposed || this.broken) return;
    this.worker.postMessage({ type: 'configure', config });
  }

  recognize(input: RecognizeInput): Promise<RecognitionResult> {
    if (this.disposed) return Promise.reject(new Error('Recognizer disposed'));
    if (this.broken) return Promise.reject(this.broken);

    const id = this.nextId++;
    return new Promise<RecognitionResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id); // a late answer for this id is ignored
        reject(new Error(`Recognition timed out after ${this.timeoutMs} ms`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.worker.postMessage({ type: 'recognize', id, lineIndex: input.lineIndex, strokes: input.strokes });
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const error = new Error('Recognizer disposed');
    this.settleReady.reject(error);
    this.rejectAll(error);
    this.worker.terminate();
  }

  private onMessage(message: WorkerResponse): void {
    switch (message.type) {
      case 'ready':
        this.settleReady.resolve();
        return;
      case 'initError':
        this.fail(new Error(message.message));
        return;
      case 'result': {
        const p = this.take(message.id);
        if (!p) return;
        p.resolve(
          message.confidence === undefined
            ? { text: message.text }
            : { text: message.text, confidence: message.confidence },
        );
        return;
      }
      case 'error': {
        const p = this.take(message.id);
        if (p) p.reject(new Error(message.message));
        return;
      }
    }
  }

  private take(id: number): Pending | undefined {
    const p = this.pending.get(id);
    if (!p) return undefined;
    clearTimeout(p.timer);
    this.pending.delete(id);
    return p;
  }

  private fail(error: Error): void {
    if (this.broken || this.disposed) return;
    this.broken = error;
    this.settleReady.reject(error);
    this.rejectAll(error);
  }

  private rejectAll(error: Error): void {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    this.pending.clear();
  }
}