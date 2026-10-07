import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { InkEngine } from './ink/inkEngine';
import { StrokeStore } from './ink/strokeStore';
import type { Tool } from './ink/types';
import { Pipeline } from './recognition/pipeline';
import { LazyWorkerRecognizer } from './recognition/lazyRecognizer';
import { createRecognitionWorker } from './recognition/createWorker';
import { PerfHud } from './ui/PerfHud';
import { INK_COLOR, PEN_COLORS } from './ink/render';

const TOOLS: { id: Tool; label: string }[] = [
  { id: 'pen', label: 'Pen' },
  { id: 'strokeEraser', label: 'Stroke eraser' },
  { id: 'pixelEraser', label: 'Pixel eraser' },
];

export default function App() {
  // React only owns the toolbar and panels. The canvas lives entirely inside InkEngine.
  const [store] = useState(() => new StrokeStore());
  const [recognizer] = useState(() => new LazyWorkerRecognizer(createRecognitionWorker, { kind: 'comer', timeoutMs: 60_000 }));
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<InkEngine | null>(null);
  const [tool, setTool] = useState<Tool>('pen');
  const [width, setWidth] = useState(3);
  const [color, setColor] = useState(INK_COLOR);
  const [showHud, setShowHud] = useState(false);
  useSyncExternalStore(store.subscribe, () => store.version); // re-render when undo/redo availability changes
  useSyncExternalStore(recognizer.subscribe, () => recognizer.version);
  const modelError = recognizer.lastError();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const engine = new InkEngine(host, store);
    const p = new Pipeline(store, recognizer);
    const sync = () =>
      engine.setOverlay(
        p.labels(),
        p.lines.map((l) => l.bounds),
      );
    const off = p.subscribe(sync);
    sync();
    engineRef.current = engine;
    setPipeline(p);
    return () => {
      off();
      p.destroy();
      engine.destroy();
      engineRef.current = null;
      setPipeline(null);
    };
  }, [store, recognizer]);

  // start loading the model right away, so the first line does not wait for it
  useEffect(() => {
    recognizer.warmUp();
    return () => recognizer.dispose();
  }, [recognizer]);

  useEffect(() => engineRef.current?.setTool(tool), [tool]);
  useEffect(() => engineRef.current?.setWidth(width), [width]);
  useEffect(() => engineRef.current?.setColor(color), [color]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' && (target as HTMLInputElement).type === 'text') return; // let text fields undo their own typing
      const k = e.key.toLowerCase();
      if (k === 'z') {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
      } else if (k === 'y') {
        e.preventDefault();
        store.redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store]);

  return (
    <div className="app">
      <header className="toolbar">
        <h1>CalcInk</h1>
        <div className="group" role="group" aria-label="Tools">
          {TOOLS.map((t) => (
            <button key={t.id} aria-pressed={tool === t.id} onClick={() => setTool(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="group">
          <button onClick={() => store.undo()} disabled={!store.canUndo}>
            Undo
          </button>
          <button onClick={() => store.redo()} disabled={!store.canRedo}>
            Redo
          </button>
          <button onClick={() => store.clear()} disabled={store.strokes.length === 0}>
            Clear
          </button>
        </div>
        <div className="group colors" role="group" aria-label="Pen color">
          {PEN_COLORS.map((c) => (
            <button
              key={c.value}
              className="swatch"
              style={{ background: c.value }}
              title={c.name}
              aria-label={c.name}
              aria-pressed={color === c.value}
              onClick={() => {
                setColor(c.value);
                setTool('pen');
              }}
            />
          ))}
          <label className="swatch custom" title="Custom color">
            <input
              type="color"
              aria-label="Custom pen color"
              value={color}
              onChange={(e) => {
                setColor(e.target.value);
                setTool('pen');
              }}
            />
          </label>
        </div>
        <label className="width">
          Width
          <input
            type="range"
            min={1}
            max={12}
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
          />
        </label>
        <button aria-pressed={showHud} onClick={() => setShowHud((v) => !v)}>
          Performance
        </button>
      </header>
      {modelError && (
        <p className="status" role="alert">
          The recognition model could not run: {modelError}
        </p>
      )}
      <div className="workspace">
        <div className="board" ref={hostRef} />
        {store.strokes.length === 0 && <p className="empty-hint">Write an equation such as 18+4×3= and pause</p>}
      </div>
      {showHud && pipeline && <PerfHud pipeline={pipeline} />}
    </div>
  );
}