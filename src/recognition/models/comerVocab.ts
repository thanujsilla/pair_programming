export interface Vocab {
  word2idx: Record<string, number>;
  idx2word: Record<string, string>;
  special_tokens: { pad: number; sos: number; eos: number };
  vocab_size: number;
}

/** Tokens the model may produce when reading arithmetic (everything else is forbidden). */
const ARITHMETIC_TOKENS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '+', '-', '.', '=', '(', ')', '/', '\\times', '\\div'];

/** Only allowed when a stacked fraction (bar with ink above and below) was really drawn. */
const FRACTION_TOKENS = ['\\frac', '{', '}'];

export function allowedTokenIds(
  vocab: Pick<Vocab, 'word2idx' | 'special_tokens'>,
  mode: 'arithmetic' | 'none',
  withFractions = false,
): Set<number> | undefined {
  if (mode === 'none') return undefined;
  const ids = new Set<number>([vocab.special_tokens.eos]);
  for (const t of withFractions ? [...ARITHMETIC_TOKENS, ...FRACTION_TOKENS] : ARITHMETIC_TOKENS) {
    const id = vocab.word2idx[t];
    if (id !== undefined) ids.add(id);
  }
  return ids;
}