import type { Recognizer } from './types';
import type { WorkerRequest, WorkerResponse } from './workerProtocol';

/** The slice of a worker's global scope that the host needs (easy to fake in tests). */
export interface HostScope {
  postMessage(message: WorkerResponse): void;
  onmessage: ((event: { data: WorkerRequest }) => void) | null;
}

export type RecognizerFactory = (options: unknown) => Recognizer | Promise<Recognizer>;
export type RecognizerRegistry = Record<string, RecognizerFactory>;

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Runs inside the worker: creates the recognizer on request and answers
 * recognize calls. Messages are handled strictly one after another, so a
 * recognize request that arrives while the model is still loading simply waits.
 * Nothing in here ever throws, so one bad request cannot stop the worker.
 */
export function attachHost(scope: HostScope, registry: RecognizerRegistry): void {
  let recognizer: Recognizer | null = null;
  let queue: Promise<void> = Promise.resolve();

  async function handle(msg: WorkerRequest): Promise<void> {
    switch (msg.type) {
      case 'init': {
        try {
          const factory = Object.hasOwn(registry, msg.kind) ? registry[msg.kind] : undefined;
          if (!factory) throw new Error(`Unknown recognizer '${msg.kind}'`);
          recognizer = await factory(msg.options);
          scope.postMessage({ type: 'ready' });
        } catch (e) {
          recognizer = null;
          scope.postMessage({ type: 'initError', message: messageOf(e) });
        }
        return;
      }
      case 'configure': {
        try {
          recognizer?.configure?.(msg.config);
        } catch {
          // a bad setting must not break recognition
        }
        return;
      }
      case 'recognize': {
        if (!recognizer) {
          scope.postMessage({ type: 'error', id: msg.id, message: 'Recognizer is not initialised' });
          return;
        }
        try {
          const out = await recognizer.recognize({ lineIndex: msg.lineIndex, strokes: msg.strokes });
          scope.postMessage(
            out.confidence === undefined
              ? { type: 'result', id: msg.id, text: out.text }
              : { type: 'result', id: msg.id, text: out.text, confidence: out.confidence },
          );
        } catch (e) {
          scope.postMessage({ type: 'error', id: msg.id, message: messageOf(e) });
        }
        return;
      }
    }
  }

  scope.onmessage = (event) => {
    queue = queue.then(() => handle(event.data));
  };
}