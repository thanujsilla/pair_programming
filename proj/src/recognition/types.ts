import type { Stroke } from '../ink/types';

export interface RecognizeInput {
  /** position of the line on the page, top to bottom, starting at 0 */
  lineIndex: number;
  strokes: readonly Stroke[];
}

export interface RecognitionResult {
  /** what the line says, e.g. "18+4×3=" (the math module cleans up LaTeX and aliases) */
  text: string;
  /** 0..1, when the model can tell */
  confidence?: number;
}

/**
 * Every recognizer (the CoMER model, and the stand-in used in tests) implements this, so the rest
 * of the app never changes when the model does.
 */
export interface Recognizer {
  readonly id: string;
  recognize(input: RecognizeInput): Promise<RecognitionResult>;
  /** Optional settings pushed from the UI (for a real model: beam width, WASM or WebGPU, ...). */
  configure?(config: unknown): void;
  dispose(): void;
}