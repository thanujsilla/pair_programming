# CalcInk – on-device handwritten math calculator

Write an equation such as `18+4×3=` with a mouse, stylus or finger. CalcInk reads the handwriting,
evaluates it and writes the answer on the page right after the `=`. Change a digit or erase a term and the
answer updates. Everything (stroke capture, preprocessing, neural-network inference, arithmetic) runs in the
browser: no cloud APIs, and it works offline.

**Live demo:** _add the Cloudflare Pages link here_

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (vitest)
npm run lint
npm run build      # type-check + production build into dist/ (also writes dist/sw.js)
npm run preview    # serve the production build (needed to try offline mode)
```

Needs Node 20+. The model and the WASM runtime are already in `public/`, so there is no download step.

**Offline check:** `npm run build && npm run preview`, open the page once, then switch the browser offline
(DevTools → Network → Offline, or airplane mode) and reload. A service worker written at build time caches the
app, the model and the ONNX WASM runtime.

## Features

| Requirement | Where |
| --- | --- |
| Low-latency canvas for mouse, stylus and touch (Pointer Events, coalesced samples), smooth curves | `src/ink/inkEngine.ts`, `render.ts` |
| Undo / redo (bounded history, an eraser drag is one step), clear | `src/ink/strokeStore.ts` |
| Stroke eraser and pixel eraser (strokes are really split) | `src/ink/eraser.ts` |
| Stroke-width slider, several pen colours | `src/App.tsx`, `render.ts` |
| Sharp on high-DPI screens (`devicePixelRatio`, fractional ratios, live changes) | `src/ink/coords.ts` |
| Recognition of 0–9, `+ − × ÷ . =` with an existing pre-trained model | `src/recognition/` |
| BODMAS/PEMDAS, multi-digit numbers, decimals, negatives, own recursive-descent parser (no `eval`) | `src/math/` |
| `Undefined` for ÷0; malformed input never throws | `src/math/evaluate.ts` |
| Answer drawn next to `=` and re-evaluated when the ink changes | `src/recognition/pipeline.ts`, `scheduler.ts` |
| Writing at any angle (diagonal, rising, falling), several equations on one row, stacked fractions, slash division | `src/ink/lineGrouper.ts`, `rotate.ts`, `sideBySide.ts`, `fractions.ts`, `src/recognition/models/slashNormalize.ts` |
| 60 FPS: inference in a Web Worker, painting in `requestAnimationFrame` | `src/recognition/recognizer.worker.ts` |
| Offline operation | `sw/sw.template.js` + plugin in `vite.config.ts` |
| Live FPS / long-task / model-time readout (*Performance* button) | `src/ui/` |

Pen colours only change how the ink looks; recognition works on stroke geometry.

## Architecture

```
pointer events ─▶ InkEngine ─▶ StrokeStore (immutable snapshots, undo/redo)
                     │               │ subscribe
            3 canvases (ink,         ▼
            overlay, live)      Pipeline ─▶ lineGrouper (strokes → lines, by geometry)
                     ▲               ▼
                     │        RecognitionScheduler (debounce 400 ms, dirty lines only,
                     │               │              one request at a time, result cache)
        answers drawn on overlay     ▼ postMessage (line straightened first)
                     │        Web Worker ─▶ preprocess ─▶ ONNX Runtime Web (WASM) ─▶ beam search
                     │               ▼ text such as "1 8 + 4 \times 3 ="
                     └──── math: normalize → tokenize → parse → Decimal evaluate
```

* **UI thread** only handles input and painting. `InkEngine` is plain TypeScript; React owns only the toolbar, so
  drawing never waits for a React render. Ink, answers and the stroke being drawn are separate canvases, so a new
  stroke repaints only the small live layer.
* **Recognition** runs in a worker (`workerHost.ts`, `workerProtocol.ts`), is debounced until the pen rests, and
  re-reads only the lines whose strokes changed (results cached by stroke signature). A result that arrives after
  the ink changed again is discarded (epoch check).
* **Stroke coordinates → tensor** (`comerPreprocess.ts`): the strokes of a line are scaled to 128 px content height,
  drawn with a ≈ 4.5 px pen into a one-channel 256 px tall image (width a multiple of 64, up to 1024) plus a pixel
  mask. The INT8 encoder runs once; the decoder runs step by step inside a beam search (width 3, max 40 steps) that may
  only emit arithmetic tokens.
* **Helpers for the model's weak spots** (all in `src/recognition/models/`): a hand-drawn `=` is detected by its
  shape (two flat bars at the end) and added back instead of being decoded (`trailingEquals.ts`); a very long `÷` bar
  is redrawn shorter (`divisionNormalize.ts`); a slash that leans over its neighbours (`1/0`) becomes a small `÷`
  (`slashNormalize.ts`); symbols are grouped by overlap (`symbolSegmenter.ts`).
* **Line grouping** (`src/ink`): rows are found by vertical overlap; diagonal writing is joined by fitting one straight
  line through the strokes (median direction between stroke centres, accepted only when the pieces agree within 15°
  and form a single row after straightening, tilts between 6° and 60°); the line is straightened before recognition and
  the answer is placed beside its `=`. A row with two `=` or a very wide gap is split into separate equations. A long flat
  bar with ink right above and below it is a stacked fraction and stays on one line (`\frac{a}{b}` is read as `(a)÷(b)`).
  Grouping 300 strokes takes about 1.5 ms (incremental merge, cached stroke bounds; a unit test guards it).
* **Math engine**: recursive-descent parser, `decimal.js` for exact decimals (0.1 + 0.2 = 0.3), results rounded to 10
  places. Division by zero gives an `undefined` result; every failure is a returned value, never a throw.
* **Memory**: undo history is capped (200 snapshots, strokes shared), the result cache is capped, listeners and
  observers are released in `destroy()`.
* **Offline**: `sw/sw.template.js` is turned into `dist/sw.js` at build time; it precaches the app, the model and
  the WASM at install and serves cache-first. `public/_headers` (for Cloudflare Pages) adds cross-origin isolation
  (multi-threaded WASM, an enhancement only) and cache rules.

## Model: source, licence, architecture and why

* **Model:** CoMER (Coverage-based Transformer for handwritten mathematical expression recognition), exported to ONNX
  and INT8-quantised: `public/models/comer/encoder_int8.onnx` (3.5 MB), `decoder_int8.onnx` (4.1 MB), `vocab.json`.
  No training was done here; the weights come from the open-source **ink-on** project
  (**repository URL: _fill in before submitting_**), which is based on CoMER (Zhao & Gao, ECCV 2022,
  https://arxiv.org/abs/2207.04410, reference code https://github.com/Green-Wood/CoMER) and trained on CROHME.
* **Licence of the model:** Apache-2.0 as stated by the ink-on repository (confirm against its `LICENSE` when you add
  the URL). The licence terms of the CROHME training data could not be independently verified; the model is used
  here for a coursework project, and anyone reusing the weights commercially must check them.
* **Architecture:** DenseNet image encoder → Transformer decoder with coverage attention, beam-search decoding.
* **Runtime:** [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) (MIT) on WASM, served from `/ort/`, not a CDN.
* **Why this model:** it reads a whole line in one pass, so there is no brittle per-symbol segmentation (the main
  failure source of a symbol classifier, which also cannot read `× ÷ .` without extra rules); it is only 7.6 MB after
  quantisation; and `× ÷ . =` and fractions are in its vocabulary. Large vision-language models are far too heavy for a
  60 FPS offline browser app. The choice was made by measurement, with a gate of 90 % whole-line exact match on real
  handwriting (one wrong symbol changes the answer): CoMER reached **86.5 %** on 37 lines from several writers
  (**91.4 %** on the 35 lines where an `=` was actually drawn), while a per-symbol CNN pipeline reached 54 %.
* **Known limits:** decimal points drawn very high or low are the main remaining error; the 90 % gate is met only
  on lines with a drawn `=`; diagonal support covers straight lines (6°–60°), not curved baselines.
* **Performance:** inference never runs on the main thread (frames stay ≈ 17 ms while a line is recognised; the same
  inference on the main thread froze the page for ≈ 2 s), measured with the in-app *Performance* readout.

## Third-party software

| Package | Licence | Use |
| --- | --- | --- |
| CoMER ONNX weights (via ink-on) | Apache-2.0 (see above) | recognition |
| onnxruntime-web (Microsoft) | MIT | runs the model on WASM; files copied to `public/ort/` |
| decimal.js | MIT | exact decimal arithmetic |
| react, react-dom | MIT | toolbar UI |
| vite, vitest, typescript, eslint | MIT | build and test tooling (not shipped) |

No fonts or other assets are downloaded at run time.

## Safety

No `eval` / `new Function`. The only `fetch` calls load our own model files. Colours are validated before they reach
the canvas.

## Project layout

`src/ink` canvas, strokes, eraser, line grouping · `src/recognition` worker, scheduler, model glue ·
`src/recognition/models` preprocessing, decoding, symbol helpers · `src/math` parser and evaluator ·
`src/ui` performance readout · `src/testing` synthetic handwriting used by tests · `sw/` service-worker template.

## Licence

CalcInk's own code is released under the Apache License 2.0.
