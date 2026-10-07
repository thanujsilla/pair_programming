import { evaluateLine } from './evaluate';
import { normalizeRecognized } from './normalize';

export { evaluateLine } from './evaluate';
export { normalizeRecognized } from './normalize';
export type { EvalResult } from './types';

/** Raw recognizer output -> final result. */
export const calculate = (raw: string) => evaluateLine(normalizeRecognized(raw));