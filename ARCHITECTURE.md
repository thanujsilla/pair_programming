# CalcInk – idea and architecture

## 1. Idea

A paper-like page where you write arithmetic by hand and the answer appears beside the `=`, like a teacher
marking a sum. The hard constraints: everything on-device, offline, 60 FPS, no `eval`, and a pre-trained open-source
recogniser. The design follows from those four.

## 2. System overview

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

| Module | Responsibility |
| --- | --- |
| `src/ink` | pointer capture, rendering, undo/redo, erasers, DPR conversion, line grouping |
| `src/recognition` | scheduling, worker protocol, preprocessing, model inference, decoding |
| `src/math` | normalise recogniser output, tokenise, parse (BODMAS), evaluate |
| `src/ui` | toolbar (React), performance readout |

Modules depend downwards only (`ui → recognition → ink`, `recognition → math`); `src/ink` and `src/math` know
nothing about the model, so each is unit-testable alone.

## 3. Canvas and rendering

* **Input:** Pointer Events with `getCoalescedEvents()` so fast pen movement keeps every sample; works for mouse,
  stylus and touch with one code path.
* **Three stacked canvases:** committed ink, answers overlay, and a small live layer for the stroke being drawn.
  A new stroke repaints only the live layer, so cost per frame does not grow with the amount of ink.
* **No React in the hot path:** `InkEngine` is plain TypeScript; React only owns the toolbar.
* **Display scaling:** backing store = CSS size × `devicePixelRatio` (fractional values supported, re-applied when
  the ratio changes); all stroke data is stored in CSS pixels, so conversion lives in one tested module (`coords.ts`).
* **Undo/redo:** `StrokeStore` keeps immutable snapshots with shared stroke objects, capped at 200; an eraser drag
  is one history step.
* **Erasers:** stroke eraser removes whole strokes; pixel eraser splits strokes at the erased segment.

## 4. Pipeline: strokes → tensor → text → answer

1. **Line grouping** (`lineGrouper.ts`): strokes are clustered into rows by vertical overlap (incremental, cached
   bounds; 300 strokes ≈ 1.5 ms, guarded by a test). Special cases:
   * *Diagonal writing* – one straight line is fitted through stroke centres (Theil–Sen median direction); accepted
     only if ≥ 70 % of pairs agree within 15° and the tilt is 6°–60°. The line is rotated flat before recognition and
     the answer is drawn beside its `=`.
   * *Side-by-side equations* – a row is split after a second `=` or at a gap ≥ 2.5 glyph heights.
   * *Stacked fractions* – a long flat bar with ink above and below stays on one line and is read as `(a)÷(b)`.
2. **Dirty-line scheduling** (`scheduler.ts`): recognition starts 400 ms after the pen rests; only lines whose stroke
   signature changed are re-read; results are cached (LRU); one request at a time; a reply that arrives after the ink
   changed again is dropped (epoch check).
3. **Rasterise** (`comerPreprocess.ts`): the line's strokes are scaled to 128 px content height and drawn with a
   ≈ 4.5 px round pen into a one-channel image 256 px tall (width rounded to a multiple of 64, max 1024), plus a pixel
   mask. This matches the stroke thickness and scale the model saw in training.
4. **Encode** once with the INT8 DenseNet encoder (ONNX Runtime Web, WASM).
5. **Decode** step by step with the Transformer decoder inside a beam search (width 3, max 40 steps). The search can
   only emit arithmetic tokens (`0-9 + - \times \div . =`, plus `\frac{ }` when a fraction was detected), so a
   mis-read can never produce a letter or an unsupported symbol.
6. **Weak-spot helpers** (`src/recognition/models/`): a drawn `=` is detected by shape (two flat bars at the end) and
   re-added rather than decoded; an over-long `÷` bar is redrawn shorter; a slash leaning over its neighbours (`1/0`)
   is replaced by a small `÷`; symbols are grouped by overlap.
7. **Evaluate** (`src/math`): normalise → tokenise → recursive-descent parser → `decimal.js`. No `eval`.

## 5. Model choice and justification

**Requirement:** read whole handwritten arithmetic lines (including `× ÷ .`) offline, small, fast, open-source.

| Option | Size | Accuracy (whole-line, 37 real lines) | Verdict |
| --- | --- | --- | --- |
| **CoMER, INT8 ONNX** | 7.6 MB | **86.5 %** (91.4 % on the 35 lines with a drawn `=`) | **chosen** |
| Per-symbol CNN + own segmentation | small | 54 % | rejected: segmentation errors, no `× ÷ .` without extra rules |
| Large vision-language model | hundreds of MB–GB | n/a | rejected: far too heavy for a 60 FPS offline browser app |

Why CoMER: it reads a whole line in one pass (no brittle segmentation), the vocabulary already contains `× ÷ . =`
and fractions, INT8 quantisation brings it to 7.6 MB, and the encoder runs once per line so latency is dominated by a
short decoder loop. The 90 % whole-line gate was chosen because one wrong symbol changes the answer; the shipped
model meets it on lines with a drawn `=`. Measured by whole-line exact match, not per-symbol accuracy.

**Known limits:** decimal points drawn very high or low; two touching `1`s can merge; diagonal support covers straight
lines, not curved baselines.

## 6. Performance and responsiveness

* **Main thread = input + paint only.** Inference, rasterising and beam search run in a Web Worker; messages are
  small (stroke arrays in, text out).
* **Frame budget:** drawing repaints only the live layer inside `requestAnimationFrame`. Measured frame time ≈ 17 ms
  (60 FPS) while a line is being recognised; the same inference on the main thread froze the page for ≈ 2 s.
* **Work avoided:** debounce, dirty-line-only recognition, result cache, cached stroke bounds.
* **Observable:** the *Performance* button shows FPS, long tasks and model time live (`src/ui/perfMonitor.ts`).
* **Memory:** history capped, result cache capped, listeners/observers released in `destroy()`; no per-frame
  allocations in the draw path.

## 7. On-device and offline

* Model and WASM runtime ship with the app (`public/models`, `public/ort`); the only `fetch` calls load our own files.
* A hand-written service worker (`sw/sw.template.js`, emitted to `dist/sw.js` by a Vite plugin) precaches the app,
  the model and the WASM at install, then serves cache-first with a navigation fallback.
* Verified in a real browser: after one online visit, airplane mode + reload still recognises and evaluates.
* Cross-origin isolation headers (`public/_headers` for Cloudflare, `vercel.json` for Vercel) enable multi-threaded
  WASM as an optional speed-up; the app does not depend on them.

## 8. Math engine

Recursive-descent parser with correct precedence and associativity (BODMAS/PEMDAS), unary minus, multi-digit numbers
and decimals, using `decimal.js` (0.1 + 0.2 = 0.3), results rounded to 10 places. Division by zero returns an
`undefined` result, shown as "Undefined". Every failure is a returned value, never an exception.

## 9. Trade-offs and future work

* Debounce of 400 ms trades a short wait for far fewer inferences.
* The `=` is added by shape because the model rarely decodes a hand-drawn one reliably.
* Possible extensions: variable memory (`x = 10`), function plotting, scratch-to-erase gesture, tap-to-correct a
  wrongly read symbol, audio/haptic feedback.
