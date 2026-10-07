import { describe, expect, it } from 'vitest';
import { beamSearch } from './beamSearch';
import type { StepFn } from './beamSearch';

const SOS = 1;
const EOS = 2;
const V = 5;

/** logits row from probabilities */
const row = (p: number[]) => Float32Array.from(p.map((x) => Math.log(x)));

/** A step function that spells out a fixed sequence, then ends. */
const spell = (seq: number[]): StepFn => async (prefix) => {
  const next = seq[prefix.length - 1] ?? EOS;
  const p = Array(V).fill(0.01);
  p[next] = 0.96;
  return row(p);
};

describe('beamSearch', () => {
  it('greedy follows the most likely token and stops at <eos>', async () => {
    const [best] = await beamSearch(spell([3, 4, 3]), { sos: SOS, eos: EOS, beamWidth: 1, maxSteps: 20 });
    expect(best.ids).toEqual([3, 4, 3]);
  });

  it('beam search can beat greedy', async () => {
    const trap: StepFn = async (prefix) => {
      if (prefix.length === 1) return row([0.01, 0.01, 0.01, 0.6, 0.37]); // 3 looks best...
      if (prefix[1] === 3) return row([0.01, 0.01, 0.34, 0.33, 0.32]); // ...but then nothing is sure
      return row([0.01, 0.01, 0.97, 0.005, 0.005]); // 4 is followed by a certain end
    };
    const opts = { sos: SOS, eos: EOS, maxSteps: 5 };
    expect((await beamSearch(trap, { ...opts, beamWidth: 1 }))[0].ids).toEqual([3]);
    expect((await beamSearch(trap, { ...opts, beamWidth: 2 }))[0].ids).toEqual([4]);
  });

  it('ends a sequence at a stop token and keeps that token', async () => {
    // the model would go on 3, 4, 3 ... forever; token 4 is a stop token
    const forever: StepFn = async (prefix) => row(prefix.length % 2 ? [0.01, 0.01, 0.01, 0.96, 0.01] : [0.01, 0.01, 0.01, 0.01, 0.96]);
    const [best] = await beamSearch(forever, { sos: SOS, eos: EOS, beamWidth: 2, maxSteps: 30, stop: new Set([4]) });
    expect(best.ids).toEqual([3, 4]);
  });

  it('never produces a forbidden token', async () => {
    const [best] = await beamSearch(spell([3, 4, 3]), { sos: SOS, eos: EOS, beamWidth: 3, maxSteps: 20, allowed: new Set([EOS, 3]) });
    expect(best.ids.every((t) => t === 3)).toBe(true);
  });

  it('stops a runaway repeat and a runaway length', async () => {
    const forever: StepFn = async () => row([0.01, 0.01, 0.01, 0.96, 0.01]);
    const [rep] = await beamSearch(forever, { sos: SOS, eos: EOS, beamWidth: 1, maxSteps: 50, repeatLimit: 3 });
    expect(rep.ids.length).toBe(3);
    const alt: StepFn = async (prefix) => row(prefix.length % 2 ? [0.01, 0.01, 0.01, 0.96, 0.01] : [0.01, 0.01, 0.01, 0.01, 0.96]);
    const [capped] = await beamSearch(alt, { sos: SOS, eos: EOS, beamWidth: 1, maxSteps: 7 });
    expect(capped.ids.length).toBe(7);
  });

  it('returns an empty answer instead of throwing when nothing is allowed', async () => {
    const out = await beamSearch(spell([3]), { sos: SOS, eos: EOS, beamWidth: 2, maxSteps: 5, allowed: new Set() });
    expect(out.length === 0 || out[0].ids.length === 0).toBe(true);
  });

  it('returns candidates best first, at most beamWidth of them', async () => {
    const out = await beamSearch(spell([3, 4]), { sos: SOS, eos: EOS, beamWidth: 3, maxSteps: 10 });
    expect(out.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < out.length; i++) expect(out[i - 1].logProb / (out[i - 1].ids.length + 1)).toBeGreaterThanOrEqual(out[i].logProb / (out[i].ids.length + 1) - 1e-9);
  });

  it('propagates a failing model (the caller handles it)', async () => {
    await expect(beamSearch(async () => { throw new Error('model crashed'); }, { sos: SOS, eos: EOS, beamWidth: 1, maxSteps: 3 })).rejects.toThrow('model crashed');
  });
});
