import type { RecognizerRegistry } from './workerHost';

/**
 * Everything the worker can run, by name. The page only ever asks for a name.
 * The model is loaded on demand, so it costs nothing until it is used.
 */
export const registry: RecognizerRegistry = {
  comer: async (options) => (await import('./models/comerRecognizer')).createComerRecognizer(options as object),
};