import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { InkEngine } from './ink/inkEngine';
import type { Tool } from './ink/types';
import { Notebook } from './notebook';
import type { Pipeline } from './recognition/pipeline';
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
  const [notebook] = useState(() => new Notebook());
  const [recognizer] = useState(() => new LazyWorkerRecognizer(createRecognitionWorker, { kind: 'comer', timeoutMs: 60_000 }));
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<InkEngine | null>(null);
  const [tool, setTool] = useState<Tool>('pen');
  const [width, setWidth] = useState(3);
  const [color, setColor] = useState(INK_COLOR);
  const [showHud, setShowHud] = useState(false);
  const [zoom, setZoom] = useState(1);
  useSyncExternalStore(notebook.subscribe, () => notebook.version); // re-render when the page changes
  const page = notebook.page;
  const store = page.store;
  useSyncExternalStore(store.subscribe, () => store.version); // re-render when undo/redo availability changes
  useSyncExternalStore(recognizer.subscribe, () => recognizer.version);
  const modelError = recognizer.lastError();

  // One engine per visible page. Each page keeps its own strokes, answers and zoom (see Notebook).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const engine = new InkEngine(host, page.store);
    const p = page.ensurePipeline(recognizer);
    const sync = () =>
      engine.setOverlay(
        p.labels(),
        p.lines.map((l) => l.bounds),
      );
    const off = p.subscribe(sync);
    sync();
    engine.setViewListener((v) => {
      page.view = v;
      setZoom(v.scale);
    });
    engine.setView(page.view);
    engineRef.current = engine;
    setPipeline(p);
    return () => {
      off();
      engine.destroy();
      engineRef.current = null;
      setPipeline(null);
    };
  }, [page, recognizer]);

  // release every page's pipeline when the app goes away
  useEffect(() => () => notebook.destroy(), [notebook]);

  // start loading the model right away, so the first line does not wait for it
  useEffect(() => {
    recognizer.warmUp();
    return () => recognizer.dispose();
  }, [recognizer]);

  useEffect(() => engineRef.current?.setTool(tool), [tool, page]);
  useEffect(() => engineRef.current?.setWidth(width), [width, page]);
  useEffect(() => engineRef.current?.setColor(color), [color, page]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' && (target as HTMLInputElement).type === 'text') return; // let text fields undo their own typing
      const k = e.key.toLowerCase();
      if (k === 'z') {
        e.preventDefault();
        if (e.shiftKey) notebook.page.store.redo();
        else notebook.page.store.undo();
      } else if (k === 'y') {
        e.preventDefault();
        notebook.page.store.redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [notebook]);

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
        <div className="group zoom" role="group" aria-label="Zoom">
          <button onClick={() => engineRef.current?.zoomBy(1 / 1.25)} aria-label="Zoom out" title="Zoom out (Ctrl + scroll, or pinch)">
            −
          </button>
          <button
            className="zoom-level"
            onClick={() => engineRef.current?.resetView()}
            aria-label="Reset zoom"
            title="Back to 100%"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={() => engineRef.current?.zoomBy(1.25)} aria-label="Zoom in" title="Zoom in (Ctrl + scroll, or pinch)">
            +
          </button>
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
        <nav className="pagebar" aria-label="Pages">
          <button onClick={() => notebook.previous()} disabled={notebook.index === 0} aria-label="Previous page">
            ‹
          </button>
          <span className="page-label" aria-live="polite">
            Page {notebook.index + 1} of {notebook.count}
          </span>
          <button onClick={() => notebook.next()} disabled={notebook.index === notebook.count - 1} aria-label="Next page">
            ›
          </button>
          <button onClick={() => notebook.addPage()} disabled={!notebook.canAdd} title="Start a new blank page">
            + New page
          </button>
          <button
            onClick={() => {
              if (store.strokes.length === 0 || window.confirm('Delete this page and everything on it?')) notebook.deletePage();
            }}
            disabled={notebook.count === 1}
            title="Delete this page"
          >
            Delete page
          </button>
        </nav>
      </div>
      {showHud && pipeline && <PerfHud pipeline={pipeline} />}
    </div>
  );
}