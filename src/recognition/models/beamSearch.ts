/** One step of the decoder: given the tokens so far, return the raw logits for the next token. */
export type StepFn = (prefix: readonly number[]) => Promise<Float32Array>;

export interface BeamOptions {
  sos: number;
  eos: number;
  /** 1 = greedy */
  beamWidth: number;
  maxSteps: number;
  /** if set, every token outside this set is forbidden */
  allowed?: ReadonlySet<number>;
  /** stop a sequence that repeats one token more than this many times in a row */
  repeatLimit?: number;
  /** tokens that end a sequence as soon as they are produced (the token itself is kept), e.g. "=" */
  stop?: ReadonlySet<number>;
}

export interface Candidate {
  /** tokens without <sos>/<eos> */
  ids: number[];
  /** sum of log-probabilities */
  logProb: number;
}

function logSoftmax(logits: Float32Array, allowed?: ReadonlySet<number>): Float64Array {
  const n = logits.length;
  const out = new Float64Array(n).fill(-Infinity);
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    if (allowed && !allowed.has(i)) continue;
    if (logits[i] > max) max = logits[i];
  }
  if (max === -Infinity) return out; // nothing allowed
  let sum = 0;
  for (let i = 0; i < n; i++) {
    if (allowed && !allowed.has(i)) continue;
    sum += Math.exp(logits[i] - max);
  }
  const lse = Math.log(sum);
  for (let i = 0; i < n; i++) {
    if (allowed && !allowed.has(i)) continue;
    out[i] = logits[i] - max - lse;
  }
  return out;
}

function topK(values: Float64Array, k: number): number[] {
  const idx: number[] = [];
  for (let i = 0; i < values.length; i++) if (values[i] > -Infinity) idx.push(i);
  idx.sort((a, b) => values[b] - values[a]);
  return idx.slice(0, k);
}

interface Hypothesis {
  ids: number[]; // includes <sos> at index 0
  logProb: number;
  /** how many of the scored tokens are not in `ids` (the <eos> that ended it) */
  extra?: number;
}

/** Mean log-probability per scored token. */
const normalized = (h: Hypothesis) => h.logProb / Math.max(h.ids.length - 1 + (h.extra ?? 0), 1);

/**
 * Beam search over a step function. Probabilities are renormalised over the
 * allowed tokens, so masking never makes the model "less sure" than it is.
 *
 * Active hypotheses are pruned by total log-probability; finished ones are
 * kept aside and ranked by mean log-probability, so a short answer is not
 * punished for being short. The search stops when nothing active can still
 * beat a finished answer. Returns candidates best-first.
 */
export async function beamSearch(step: StepFn, opts: BeamOptions): Promise<Candidate[]> {
  const width = Math.max(1, Math.floor(opts.beamWidth));
  const repeatLimit = opts.repeatLimit ?? 3;
  let active: Hypothesis[] = [{ ids: [opts.sos], logProb: 0 }];
  const finished: Hypothesis[] = [];

  for (let t = 0; t < opts.maxSteps && active.length > 0; t++) {
    const next: Hypothesis[] = [];
    for (const h of active) {
      const lp = logSoftmax(await step(h.ids), opts.allowed);
      for (const tok of topK(lp, width * 2)) {
        const logProb = h.logProb + lp[tok];
        if (tok === opts.eos) {
          finished.push({ ids: h.ids, logProb, extra: 1 });
          continue;
        }
        if (opts.stop?.has(tok)) {
          finished.push({ ids: [...h.ids, tok], logProb });
          continue;
        }
        let run = 0;
        for (let j = h.ids.length - 1; j >= 1 && h.ids[j] === tok; j--) run++;
        if (run >= repeatLimit) finished.push({ ids: h.ids, logProb, extra: 1 });
        else next.push({ ids: [...h.ids, tok], logProb });
      }
    }
    next.sort((a, b) => b.logProb - a.logProb);
    active = next.slice(0, width);
    if (finished.length >= width && active.length > 0) {
      const bestFinished = Math.max(...finished.map((f) => f.logProb));
      if (active[0].logProb < bestFinished) break;
    }
  }

  const ranked = [
    ...finished.map((h) => ({ h, score: normalized(h) })),
    ...(finished.length === 0 ? active.map((h) => ({ h, score: normalized(h) })) : []),
  ].sort((a, b) => b.score - a.score);
  return ranked.slice(0, width).map(({ h }) => ({ ids: h.ids.slice(1), logProb: h.logProb }));
}