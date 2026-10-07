import { beforeEach, describe, expect, it } from 'vitest';
import { StrokeStore } from './strokeStore';
import { dot, line } from './testUtils';

let store: StrokeStore;
beforeEach(() => {
  store = new StrokeStore();
});

describe('add / undo / redo', () => {
  it('starts empty with nothing to undo or redo', () => {
    expect(store.strokes).toHaveLength(0);
    expect(store.canUndo).toBe(false);
    expect(store.canRedo).toBe(false);
    expect(store.undo()).toBe(false);
    expect(store.redo()).toBe(false);
  });

  it('undoes and redoes strokes in order', () => {
    store.addStroke(line('a', 0, 0, 10, 0));
    store.addStroke(line('b', 0, 10, 10, 10));
    expect(store.strokes.map((s) => s.id)).toEqual(['a', 'b']);
    store.undo();
    expect(store.strokes.map((s) => s.id)).toEqual(['a']);
    store.undo();
    expect(store.strokes).toHaveLength(0);
    store.redo();
    expect(store.strokes.map((s) => s.id)).toEqual(['a']);
    store.redo();
    expect(store.strokes.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('drops the redo history after a new action', () => {
    store.addStroke(line('a', 0, 0, 10, 0));
    store.undo();
    expect(store.canRedo).toBe(true);
    store.addStroke(line('b', 0, 0, 10, 0));
    expect(store.canRedo).toBe(false);
  });

  it('ignores empty strokes', () => {
    store.addStroke({ id: 'x', points: [], width: 2 });
    expect(store.strokes).toHaveLength(0);
    expect(store.canUndo).toBe(false);
  });
});

describe('clear', () => {
  it('can be undone', () => {
    store.addStroke(line('a', 0, 0, 10, 0));
    store.addStroke(line('b', 0, 10, 10, 10));
    store.clear();
    expect(store.strokes).toHaveLength(0);
    store.undo();
    expect(store.strokes).toHaveLength(2);
  });
  it('does nothing on an empty canvas', () => {
    store.clear();
    expect(store.canUndo).toBe(false);
  });
});

describe('stroke eraser', () => {
  it('removes only the strokes it touches', () => {
    store.addStroke(line('a', 0, 0, 100, 0));
    store.addStroke(line('b', 0, 100, 100, 100));
    expect(store.eraseStrokesAt(50, 2, 8)).toBe(true);
    expect(store.strokes.map((s) => s.id)).toEqual(['b']);
  });
  it('returns false and records no history when nothing is hit', () => {
    store.addStroke(line('a', 0, 0, 100, 0));
    const before = store.strokes;
    expect(store.eraseStrokesAt(50, 80, 8)).toBe(false);
    expect(store.strokes).toBe(before);
  });
});

describe('pixel eraser', () => {
  it('splits a stroke into pieces', () => {
    store.addStroke(line('a', 0, 0, 100, 0, 21, 2));
    expect(store.erasePixelsAt(50, 0, 10)).toBe(true);
    expect(store.strokes).toHaveLength(2);
  });
  it('removes a dot', () => {
    store.addStroke(dot('d', 10, 10));
    expect(store.erasePixelsAt(10, 10, 6)).toBe(true);
    expect(store.strokes).toHaveLength(0);
  });
});

describe('gestures group one drag into one undo step', () => {
  it('undoes a whole eraser drag at once', () => {
    store.addStroke(line('a', 0, 0, 200, 0, 41, 2));
    store.beginGesture();
    store.erasePixelsAt(40, 0, 8);
    store.erasePixelsAt(100, 0, 8);
    store.erasePixelsAt(160, 0, 8);
    store.endGesture();
    expect(store.strokes.length).toBeGreaterThan(1);
    store.undo(); // one undo restores the original stroke
    expect(store.strokes.map((s) => s.id)).toEqual(['a']);
    store.redo();
    expect(store.strokes.length).toBeGreaterThan(1);
  });

  it('records nothing when the drag erased nothing', () => {
    store.addStroke(line('a', 0, 0, 100, 0));
    store.undo();
    store.redo(); // redo stack now empty again, undo stack has 1
    store.beginGesture();
    store.erasePixelsAt(500, 500, 8);
    store.endGesture();
    store.undo();
    expect(store.strokes).toHaveLength(0); // one undo removed the stroke, not a phantom step
  });
});

describe('bounded history', () => {
  it('keeps at most 200 undo steps', () => {
    for (let i = 0; i < 250; i++) store.addStroke(line(`s${i}`, 0, i, 10, i));
    let undone = 0;
    while (store.undo()) undone++;
    expect(undone).toBe(200);
  });
});

describe('subscriptions', () => {
  it('notifies on change, bumps version, and can unsubscribe', () => {
    let calls = 0;
    const off = store.subscribe(() => calls++);
    const v0 = store.version;
    store.addStroke(line('a', 0, 0, 10, 0));
    expect(calls).toBe(1);
    expect(store.version).toBeGreaterThan(v0);
    off();
    store.addStroke(line('b', 0, 0, 10, 0));
    expect(calls).toBe(1);
  });
});