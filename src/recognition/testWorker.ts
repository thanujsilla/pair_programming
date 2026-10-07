import { attachHost } from './workerHost';
import type { HostScope, RecognizerRegistry } from './workerHost';
import type { WorkerLike } from './workerRecognizer';
import type { WorkerRequest, WorkerResponse } from './workerProtocol';

export interface Loopback extends WorkerLike {
  terminated: boolean;
  /** simulate the worker crashing */
  crash(message: string): void;
  /** every request the page sent */
  sent: WorkerRequest[];
}

/**
 * A fake worker for tests: the real host runs in the same thread, and messages
 * are structured-cloned and delivered asynchronously like a real worker.
 */
export function loopbackWorker(registry: RecognizerRegistry): Loopback {
  let onMessage: (m: WorkerResponse) => void = () => {};
  let onError: (m: string) => void = () => {};
  const scope: HostScope = {
    onmessage: null,
    postMessage(message) {
      const copy = structuredClone(message);
      queueMicrotask(() => {
        if (!lb.terminated) onMessage(copy);
      });
    },
  };
  attachHost(scope, registry);
  const lb: Loopback = {
    terminated: false,
    sent: [],
    postMessage(message) {
      if (lb.terminated) throw new Error('worker terminated');
      lb.sent.push(message);
      const copy = structuredClone(message);
      queueMicrotask(() => {
        if (!lb.terminated) scope.onmessage?.({ data: copy });
      });
    },
    terminate() {
      lb.terminated = true;
    },
    listen(m, e) {
      onMessage = m;
      onError = e;
    },
    crash(message) {
      onError(message);
    },
  };
  return lb;
}
