# CalcInk – on-device handwritten math calculator

Write an equation such as `18+4×3=` with a mouse, stylus or finger. CalcInk reads the handwriting, evaluates it
and writes the answer on the page right after the `=`. Change a digit or erase a term and the answer updates.
Stroke capture, preprocessing, neural-network inference and arithmetic all run in the browser: **no cloud APIs,
and it works offline (airplane mode).**

**Live demo:**https://pair-programming-proj.vercel.app/
**Design document:** [ARCHITECTURE.md](ARCHITECTURE.md) ·

## Quick start

Requires Node 20+ and npm. The model and the WASM runtime are already in `public/`, so there is no download step.

```bash
npm install
npm run dev        # http://localhost:5173
```

| Command | Purpose |
| --- | --- |
| `npm test` | unit tests (Vitest) |
| `npm run lint` | ESLint |
| `npm run build` | type-check + production build into `dist/` (also writes `dist/sw.js`) |
| `npm run preview` | serve the production build (needed to try offline mode) |

**Verify offline mode:** `npm run build && npm run preview`, open the page once, switch the browser offline
(DevTools → Network → Offline, or airplane mode), reload, and write an equation. It still works because a service
worker caches the app, the model and the ONNX WASM runtime.

## Features

| Requirement | Where |
| --- | --- |
| Low-latency canvas (mouse, stylus, touch; Pointer Events, coalesced samples, smooth curves) | `src/ink/inkEngine.ts`, `render.ts` |
| Undo / redo (bounded history, one eraser drag = one step), clear | `src/ink/strokeStore.ts` |
| Stroke eraser and pixel eraser (strokes are really split) | `src/ink/eraser.ts` |
| Stroke-width slider, pen colours | `src/App.tsx`, `render.ts` |
| Sharp on high-DPI screens (`devicePixelRatio`, fractional ratios, live changes) | `src/ink/coords.ts` |
| Recognises `0–9 + − × ÷ . =` with a pre-trained model | `src/recognition/` |
| BODMAS/PEMDAS, multi-digit, decimals, negatives; own parser, no `eval` | `src/math/` |
| `Undefined` for ÷0; malformed input never throws | `src/math/evaluate.ts` |
| Answer drawn next to `=`, re-evaluated when the ink changes | `src/recognition/pipeline.ts`, `scheduler.ts` |
| Diagonal writing, several equations on one row, stacked fractions, slash division | `src/ink/lineGrouper.ts`, `rotate.ts`, `sideBySide.ts`, `fractions.ts` |
| 60 FPS: inference in a Web Worker, painting in `requestAnimationFrame` | `src/recognition/recognizer.worker.ts` |
| Offline operation | `sw/sw.template.js` + plugin in `vite.config.ts` |
| Live FPS / long-task / model-time readout (*Performance* button) | `src/ui/` |

## Model attribution

| | |
| --- | --- |
| **Model** | CoMER (Coverage-based Transformer for handwritten math expression recognition), exported to ONNX, INT8-quantised |
| **Source** | open-source **ink-on** project: https://github.com/kimseungdae/ink-on · based on CoMER, Zhao & Gao, ECCV 2022 ([paper](https://arxiv.org/abs/2207.04410), [reference code](https://github.com/Green-Wood/CoMER)) |
| **Licence** | Apache-2.0 as stated by the ink-on repository (_confirm against its LICENSE file_). Trained on CROHME; reuse of the weights beyond coursework should check the data terms |
| **Architecture** | DenseNet image encoder → Transformer decoder with coverage attention, beam-search decoding |
| **Size** | `encoder_int8.onnx` 3.5 MB + `decoder_int8.onnx` 4.1 MB + `vocab.json` (in `public/models/comer/`) |
| **Runtime** | [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) (MIT) on WASM, served from `/ort/`, not a CDN |

No training was done in this project. Why this model was chosen, the alternatives measured, and the full pipeline
from canvas strokes to tensors are in [ARCHITECTURE.md](ARCHITECTURE.md).

## Third-party software

| Package | Licence | Use |
| --- | --- | --- |
| CoMER ONNX weights (via ink-on) | Apache-2.0 | recognition |
| onnxruntime-web | MIT | runs the model on WASM |
| decimal.js | MIT | exact decimal arithmetic |
| react, react-dom | MIT | toolbar UI |
| vite, vitest, typescript, eslint | MIT | build/test tooling (not shipped) |

No fonts or other assets are downloaded at run time.

## Project layout

```
src/ink          canvas, strokes, eraser, line grouping, coordinate conversion
src/recognition  worker, scheduler, pipeline, model glue (src/recognition/models)
src/math         tokenizer, parser, evaluator
src/ui           performance readout
src/testing      synthetic handwriting used by tests
sw/              service-worker template (built into dist/sw.js)
public/          model files, ONNX WASM runtime
```

## Licence

CalcInk's own code is released under the Apache License 2.0.
