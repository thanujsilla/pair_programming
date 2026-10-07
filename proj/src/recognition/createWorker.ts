import { webWorkerAdapter } from './workerRecognizer';
import type { WorkerLike } from './workerRecognizer';

/** Starts a fresh recognition worker (the bundler turns the URL below into its own chunk). */
export const createRecognitionWorker = (): WorkerLike =>
  webWorkerAdapter(new Worker(new URL('./recognizer.worker.ts', import.meta.url), { type: 'module' }));