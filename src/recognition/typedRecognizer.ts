import type { RecognitionResult, RecognizeInput, Recognizer } from './types';

/**
 * A stand-in recognizer for tests: you tell it what each line says.
 * Accepts `{ texts?: string[] }` through `configure`, the shape that crosses the worker boundary.
 */
export class TypedRecognizer implements Recognizer {
  readonly id = 'typed';
  private texts: string[] = [];

  setText(lineIndex: number, text: string): void {
    this.texts[lineIndex] = text;
  }

  getText(lineIndex: number): string {
    return this.texts[lineIndex] ?? '';
  }

  configure(config: unknown): void {
    if (typeof config !== 'object' || config === null) return;
    const c = config as { texts?: unknown };
    if (Array.isArray(c.texts)) this.texts = Array.from(c.texts, (t) => (typeof t === 'string' ? t : ''));
  }

  async recognize(input: RecognizeInput): Promise<RecognitionResult> {
    return { text: this.getText(input.lineIndex) };
  }

  dispose(): void {}
}