import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrokeStore } from '../ink/strokeStore';
import { line } from '../ink/testUtils';
import { Pipeline } from './pipeline';
import { TypedRecognizer } from './typedRecognizer';

const digit = (id: string, x: number, top = 100) => line(id, x, top, x, top + 40);

let store: StrokeStore;
let recognizer: TypedRecognizer;
let pipeline: Pipeline;

beforeEach(() => {
  vi.useFakeTimers();
  store = new StrokeStore();
  recognizer = new TypedRecognizer();
  pipeline = new Pipeline(store, recognizer, { debounceMs: 100 });
});
afterEach(() => {
  pipeline.destroy();
  vi.useRealTimers();
});

const settle = () => vi.advanceTimersByTimeAsync(150);

describe('answers beside the line', () => {
  it('shows nothing until the line has been recognized', () => {
    store.addStroke(digit('a', 100));
    recognizer.setText(0, '1+1=');
    expect(pipeline.labels()).toEqual([]);
  });

  it('draws no placeholder while the model is still reading, only the final answer', async () => {
    let release: (text: string) => void = () => {};
    const slow = {
      id: 'slow',
      recognize: () => new Promise<{ text: string }>((resolve) => (release = (text) => resolve({ text }))),
      dispose: () => {},
    };
    const p = new Pipeline(store, slow, { debounceMs: 100 });
    store.addStroke(digit('a', 100));
    await vi.advanceTimersByTimeAsync(150); // the model is now running
    expect(p.labels()).toEqual([]);
    release('2+3=');
    await vi.advanceTimersByTimeAsync(10);
    expect(p.labels()).toMatchObject([{ text: '5', kind: 'ok' }]);
    p.destroy();
  });

  it('evaluates the line and anchors the answer to its ink', async () => {
    store.addStroke(digit('a', 100));
    store.addStroke(digit('b', 200));
    recognizer.setText(0, '18+4×3=');
    await settle();
    const labels = pipeline.labels();
    expect(labels).toHaveLength(1);
    expect(labels[0]).toMatchObject({ text: '30', kind: 'ok' });
    expect(labels[0]!.anchor.right).toBe(201); // right edge of the last stroke
  });

  it('updates the answer when the text changes (reactive editing)', async () => {
    store.addStroke(digit('a', 100));
    recognizer.setText(0, '18+4×3=');
    await settle();
    expect(pipeline.labels()[0]!.text).toBe('30');
    recognizer.setText(0, '18+4×5=');
    pipeline.invalidate();
    await settle();
    expect(pipeline.labels()[0]!.text).toBe('38');
  });

  it('shows Undefined for division by zero', async () => {
    store.addStroke(digit('a', 100));
    recognizer.setText(0, '6÷0=');
    await settle();
    expect(pipeline.labels()[0]).toMatchObject({ text: 'Undefined', kind: 'undefined' });
  });

  it('shows a question mark for malformed input instead of throwing', async () => {
    store.addStroke(digit('a', 100));
    recognizer.setText(0, '6×=');
    await settle();
    expect(pipeline.labels()[0]).toMatchObject({ text: '?', kind: 'error' });
  });

  it('shows nothing while the equation has no "=" yet', async () => {
    store.addStroke(digit('a', 100));
    recognizer.setText(0, '6×3');
    await settle();
    expect(pipeline.labels()).toEqual([]);
  });

  it('gives each line its own answer', async () => {
    store.addStroke(digit('a', 100, 100));
    store.addStroke(digit('b', 100, 300));
    recognizer.setText(0, '2+2=');
    recognizer.setText(1, '9÷3=');
    await settle();
    expect(pipeline.labels().map((l) => l.text)).toEqual(['4', '3']);
    expect(pipeline.lines).toHaveLength(2);
  });
});

describe('editing the ink', () => {
  it('hides the answer as soon as the ink changes, and brings it back after recognition', async () => {
    store.addStroke(digit('a', 100));
    recognizer.setText(0, '2+2=');
    await settle();
    expect(pipeline.labels()).toHaveLength(1);

    store.addStroke(digit('b', 130)); // user writes more
    expect(pipeline.labels()).toEqual([]); // stale answer is not shown
    await settle();
    expect(pipeline.labels()).toHaveLength(1);
  });

  it('shows the cached answer immediately after undo', async () => {
    store.addStroke(digit('a', 100));
    recognizer.setText(0, '2+2=');
    await settle();
    store.addStroke(digit('b', 130));
    await settle();
    store.undo();
    expect(pipeline.labels()).toHaveLength(1); // no waiting: result for the earlier ink is cached
  });

  it('removes the line (and its answer) when all ink is cleared', async () => {
    store.addStroke(digit('a', 100));
    recognizer.setText(0, '2+2=');
    await settle();
    store.clear();
    expect(pipeline.lines).toHaveLength(0);
    expect(pipeline.labels()).toEqual([]);
  });
});

describe('subscriptions', () => {
  it('notifies listeners and stops after destroy', async () => {
    let calls = 0;
    pipeline.subscribe(() => calls++);
    store.addStroke(digit('a', 100));
    expect(calls).toBeGreaterThan(0);
    pipeline.destroy();
    const before = calls;
    store.addStroke(digit('b', 130));
    await settle();
    expect(calls).toBe(before);
  });
});