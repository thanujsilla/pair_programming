import { describe, expect, it } from 'vitest';
import { allowedTokenIds } from './comerVocab';

const vocab = {
  special_tokens: { pad: 0, sos: 1, eos: 2 },
  word2idx: { '<pad>': 0, '<sos>': 1, '<eos>': 2, '0': 3, '7': 4, '+': 5, '\\times': 6, '\\frac': 7, x: 8 },
};

describe('allowedTokenIds', () => {
  it('allows digits, operators and the end marker only', () => {
    const ids = allowedTokenIds(vocab, 'arithmetic')!;
    for (const id of [2, 3, 4, 5, 6]) expect(ids.has(id)).toBe(true);
    for (const id of [0, 1, 7, 8]) expect(ids.has(id)).toBe(false);
  });
  it('allows everything when masking is off', () => {
    expect(allowedTokenIds(vocab, 'none')).toBeUndefined();
  });
  it('ignores symbols the vocabulary does not have', () => {
    expect(() => allowedTokenIds(vocab, 'arithmetic')).not.toThrow();
  });
});
