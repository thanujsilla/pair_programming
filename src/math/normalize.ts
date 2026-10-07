/**
 * Cleans raw recognizer output (plain text or LaTeX tokens) into the canonical
 * form the tokenizer expects, e.g. "1 8 + 4 \times 3 =" -> "18+4×3=".
 */
export function normalizeRecognized(raw: string): string {
  let s = raw;

  // \frac{a}{b} -> (a)÷(b), innermost first
  for (let i = 0; i < 5; i++) {
    const next = s.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)÷($2)');
    if (next === s) break;
    s = next;
  }

  return s
    .replace(/\\(?:times|cdot)/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\(?:left|right|ldots|cdots|,|;|!)/g, '')
    .replace(/[{}\s]/g, '') // braces and spaces: "1 8" -> "18"
    .replace(/[-–—]/g, '−')
    .replace(/\*/g, '×')
    .replace(/\//g, '÷')
    .replace(/,/g, '.') // comma misread as a decimal point
    .replace(/(?<=[\d.)])[xX](?=[\d.(−+])/g, '×'); // "3x4" -> "3×4"
}