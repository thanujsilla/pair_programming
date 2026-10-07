export type Op = '+' | '−' | '×' | '÷';

export type Token =
  | { type: 'num'; text: string }
  | { type: 'op'; op: Op }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'equals' };

export type TokenizeResult =
  | { ok: true; tokens: Token[] }
  | { ok: false; message: string };

// Accepts the canonical symbols plus common ASCII aliases.
const OPS: Record<string, Op> = {
  '+': '+',
  '-': '−',
  '−': '−',
  '–': '−',
  '×': '×',
  '*': '×',
  '÷': '÷',
  '/': '÷',
};

export function tokenize(input: string): TokenizeResult {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input.charAt(i);
    if (/\s/.test(ch)) {
      i++;
    } else if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < input.length && /[0-9.]/.test(input.charAt(j))) j++;
      const text = input.slice(i, j);
      // Needs at least one digit and at most one decimal point.
      if (!/\d/.test(text) || text.split('.').length > 2) {
        return { ok: false, message: `Malformed number '${text}'` };
      }
      tokens.push({ type: 'num', text });
      i = j;
    } else if (ch in OPS) {
      tokens.push({ type: 'op', op: OPS[ch] as Op });
      i++;
    } else if (ch === '(') {
      tokens.push({ type: 'lparen' });
      i++;
    } else if (ch === ')') {
      tokens.push({ type: 'rparen' });
      i++;
    } else if (ch === '=') {
      tokens.push({ type: 'equals' });
      i++;
    } else {
      return { ok: false, message: `Unexpected character '${ch}'` };
    }
  }
  return { ok: true, tokens };
}