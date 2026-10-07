import type { Stroke } from '../ink/types';

/** Messages from the page to the worker. */
export type WorkerRequest =
  | { type: 'init'; kind: string; options?: unknown }
  | { type: 'configure'; config: unknown }
  | { type: 'recognize'; id: number; lineIndex: number; strokes: readonly Stroke[] };

/** Messages from the worker back to the page. */
export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'initError'; message: string }
  | { type: 'result'; id: number; text: string; confidence?: number }
  | { type: 'error'; id: number; message: string };