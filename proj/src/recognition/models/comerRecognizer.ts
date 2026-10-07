import type { Recognizer, RecognizeInput, RecognitionResult } from '../types';
import { beamSearch } from './beamSearch';
import { strokesToInput, DEFAULT_STROKE_PX } from './comerPreprocess';
import { findFractions } from '../../ink/fractions';
import { allowedTokenIds } from './comerVocab';
import { normalizeDivision } from './divisionNormalize';
import { separateSlashes } from './slashNormalize';
import { splitTrailingEquals } from './trailingEquals';
import type { Vocab } from './comerVocab';
import { appBase, fetchBytes, getOrt } from './ortRuntime';

export interface ComerOptions {
  /** folder holding encoder_int8.onnx, decoder_int8.onnx, vocab.json */
  modelUrl?: string;
  beamWidth?: number;
  maxSteps?: number;
  strokePx?: number;
  mask?: 'arithmetic' | 'none';
}

/**
 * ink-on's CoMER model (INT8 ONNX): reads a whole line of handwriting and
 * returns LaTeX-like text. Runs on WASM; call it from a worker.
 */
export async function createComerRecognizer(options: ComerOptions = {}): Promise<Recognizer> {
  const ort = getOrt();
  const base = options.modelUrl ?? `${appBase()}models/comer/`;
  const [vocabBytes, encBytes, decBytes] = await Promise.all([
    fetchBytes(`${base}vocab.json`),
    fetchBytes(`${base}encoder_int8.onnx`),
    fetchBytes(`${base}decoder_int8.onnx`),
  ]);
  const vocab = JSON.parse(new TextDecoder().decode(vocabBytes)) as Vocab;
  const sessionOptions = { executionProviders: ['wasm'] };
  const [encoder, decoder] = await Promise.all([
    ort.InferenceSession.create(encBytes, sessionOptions),
    ort.InferenceSession.create(decBytes, sessionOptions),
  ]);

  const cfg = {
    beamWidth: options.beamWidth ?? 3,
    maxSteps: options.maxSteps ?? 40,
    strokePx: options.strokePx ?? DEFAULT_STROKE_PX,
    mask: options.mask ?? ('arithmetic' as 'arithmetic' | 'none'),
  };

  return {
    id: 'comer',

    configure(config: unknown) {
      if (typeof config !== 'object' || config === null) return;
      const c = config as Partial<typeof cfg>;
      if (typeof c.beamWidth === 'number' && c.beamWidth >= 1) cfg.beamWidth = Math.floor(c.beamWidth);
      if (typeof c.maxSteps === 'number' && c.maxSteps >= 1) cfg.maxSteps = Math.floor(c.maxSteps);
      if (typeof c.strokePx === 'number' && c.strokePx > 0) cfg.strokePx = c.strokePx;
      if (c.mask === 'arithmetic' || c.mask === 'none') cfg.mask = c.mask;
    },

    async recognize(input: RecognizeInput): Promise<RecognitionResult> {
      // a hand-drawn "=" at the end is taken off before reading and added back afterwards
      const { hasEquals, rest } = splitTrailingEquals(input.strokes);
      const model = strokesToInput(normalizeDivision(separateSlashes(rest)), cfg.strokePx);
      if (!model) return { text: hasEquals ? '=' : '' };
      // The model is never allowed to write "=" itself: it confuses it with a division sign.
      // An "=" exists only when two bars were really drawn at the end of the line (added back below).
      const eqId = vocab.word2idx['='];
      let allowed = allowedTokenIds(vocab, cfg.mask, findFractions(rest).length > 0);
      if (eqId !== undefined) {
        allowed = new Set(allowed ?? Array.from({ length: vocab.vocab_size }, (_, i) => i));
        allowed.delete(eqId);
      }

      const pixelValues = new ort.Tensor('float32', model.tensor, [1, 1, model.height, model.width]);
      const pixelMask = new ort.Tensor('bool', model.mask, [1, model.height, model.width]);
      const enc = await encoder.run({ pixel_values: pixelValues, pixel_mask: pixelMask });
      const features = enc['encoder_features'];
      const featMask = enc['encoder_mask'];
      try {
        const V = vocab.vocab_size;
        const candidates = await beamSearch(
          async (prefix) => {
            const ids = new ort.Tensor('int64', BigInt64Array.from(prefix, (n) => BigInt(n)), [1, prefix.length]);
            const out = await decoder.run({ encoder_features: features, encoder_mask: featMask, input_ids: ids });
            const logits = out['logits'].data as Float32Array;
            const row = logits.slice((prefix.length - 1) * V, prefix.length * V);
            ids.dispose();
            out['logits'].dispose();
            return row;
          },
          {
            sos: vocab.special_tokens.sos,
            eos: vocab.special_tokens.eos,
            beamWidth: cfg.beamWidth,
            maxSteps: cfg.maxSteps,
            allowed,
          },
        );
        const best = candidates[0];
        if (!best) return { text: '' };
        const read = best.ids.map((id) => vocab.idx2word[String(id)] ?? '').join(' ');
        const text = hasEquals ? `${read} =`.trim() : read;
        const confidence = Math.exp(best.logProb / Math.max(best.ids.length + 1, 1));
        return { text, confidence };
      } finally {
        pixelValues.dispose();
        pixelMask.dispose();
        features.dispose();
        featMask.dispose();
      }
    },

    async dispose() {
      await Promise.allSettled([encoder.release(), decoder.release()]);
    },
  } as Recognizer;
}