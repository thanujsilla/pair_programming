import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Line } from '../ink/lineGrouper';
import { RecognitionScheduler } from './scheduler';
import type { RecognizeInput, Recognizer } from './types';

function mkLine(index: number, signature: string): Line {
  return {
    index,
    strokes: [],
    bounds: { left: 0, top: index * 100, right: 100, bottom: index * 100 + 40 },
    signature,
    angle: 0,
    endBounds: { left: 0, top: index * 100, right: 100, bottom: index * 100 + 40 },
    glyphHeight: 40,
    tail: { x: 100, y: index * 100 + 20 },
  };
}

/** A recognizer that answers from a table and records how it was used. */
function fakeRecognizer(opts: { delayMs?: number; fail?: boolean } = {}) {
  const texts: Record<number, string> = { 0: '1+1=', 1: '2+2=', 2: '3+3=' };
  const state = { calls: 0, inFlight: 0, maxInFlight: 0, seen: [] as number[] };
  const recognizer: Recognizer = {
    id: 'fake',
    async recognize(input: RecognizeInput) {
      state.calls++;
      state.seen.push(input.lineIndex);
      state.inFlight++;
      state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
      try {
        if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
        if (opts.fail) throw new Error('model crashed');
        return { text: texts[input.lineIndex] ?? '' };
      } finally {
        state.inFlight--;
      }
    },
    dispose() {},
  };
  return { recognizer, state, texts };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('debounce', () => {
  it('waits for the pen to rest, then recognizes once', async () => {
    const { recognizer, state } = fakeRecognizer();
    const s = new RecognitionScheduler(recognizer, { debounceMs: 400, onChange: () => {} });
    s.update([mkLine(0, 'a')]);
    await vi.advanceTimersByTimeAsync(399);
    expect(state.calls).toBe(0);
    await vi.advanceTimersByTimeAsync(2);
    expect(state.calls).toBe(1);
    const status = s.statusOf(mkLine(0, 'a'));
    expect(status).toMatchObject({ state: 'done', text: '1+1=' });
    if (status.state === 'done') expect(status.result).toEqual({ status: 'ok', value: '2' });
  });

  it('restarts the wait whenever the ink changes again', async () => {
    const { recognizer, state } = fakeRecognizer();
    const s = new RecognitionScheduler(recognizer, { debounceMs: 400, onChange: () => {} });
    s.update([mkLine(0, 'a')]);
    await vi.advanceTimersByTimeAsync(300);
    s.update([mkLine(0, 'a2')]); // still writing
    await vi.advanceTimersByTimeAsync(300); // t = 600, only 300 since the last change
    expect(state.calls).toBe(0);
    await vi.advanceTimersByTimeAsync(101);
    expect(state.calls).toBe(1);
  });

  it('reports idle while waiting', () => {
    const { recognizer } = fakeRecognizer();
    const s = new RecognitionScheduler(recognizer, { onChange: () => {} });
    s.update([mkLine(0, 'a')]);
    expect(s.statusOf(mkLine(0, 'a'))).toEqual({ state: 'idle' });
  });
});

describe('only changed lines are recognized', () => {
  it('caches by signature', async () => {
    const { recognizer, state } = fakeRecognizer();
    const s = new RecognitionScheduler(recognizer, { debounceMs: 100, onChange: () => {} });
    s.update([mkLine(0, 'a')]);
    await vi.advanceTimersByTimeAsync(150);
    expect(state.calls).toBe(1);
    s.update([mkLine(0, 'a')]); // nothing changed
    await vi.advanceTimersByTimeAsync(500);
    expect(state.calls).toBe(1);
  });

  it('re-runs just the edited line', async () => {
    const { recognizer, state } = fakeRecognizer();
    const s = new RecognitionScheduler(recognizer, { debounceMs: 100, onChange: () => {} });
    s.update([mkLine(0, 'a'), mkLine(1, 'b')]);
    await vi.advanceTimersByTimeAsync(150);
    expect(state.calls).toBe(2);
    s.update([mkLine(0, 'a'), mkLine(1, 'b2')]);
    await vi.advanceTimersByTimeAsync(150);
    expect(state.calls).toBe(3);
    expect(state.seen).toEqual([0, 1, 1]);
  });

  it('answers instantly from the cache when an edit is undone', async () => {
    const { recognizer, state } = fakeRecognizer();
    const s = new RecognitionScheduler(recognizer, { debounceMs: 100, onChange: () => {} });
    s.update([mkLine(0, 'a')]);
    await vi.advanceTimersByTimeAsync(150);
    s.update([mkLine(0, 'a-edited')]);
    await vi.advanceTimersByTimeAsync(150);
    s.update([mkLine(0, 'a')]); // undo
    expect(s.statusOf(mkLine(0, 'a')).state).toBe('done');
    await vi.advanceTimersByTimeAsync(500);
    expect(state.calls).toBe(2);
  });
});

describe('one request at a time', () => {
  it('never runs two recognitions together and finishes all lines', async () => {
    const { recognizer, state } = fakeRecognizer({ delayMs: 50 });
    const s = new RecognitionScheduler(recognizer, { debounceMs: 100, onChange: () => {} });
    const lines = [mkLine(0, 'a'), mkLine(1, 'b'), mkLine(2, 'c')];
    s.update(lines);
    await vi.advanceTimersByTimeAsync(100 + 3 * 50 + 10);
    expect(state.calls).toBe(3);
    expect(state.maxInFlight).toBe(1);
    expect(lines.every((l) => s.statusOf(l).state === 'done')).toBe(true);
  });

  it('shows "running" while a line is being recognized', async () => {
    const { recognizer } = fakeRecognizer({ delayMs: 50 });
    const s = new RecognitionScheduler(recognizer, { debounceMs: 100, onChange: () => {} });
    s.update([mkLine(0, 'a')]);
    await vi.advanceTimersByTimeAsync(110);
    expect(s.statusOf(mkLine(0, 'a')).state).toBe('running');
    await vi.advanceTimersByTimeAsync(50);
    expect(s.statusOf(mkLine(0, 'a')).state).toBe('done');
  });
});

describe('editing while a request is in flight', () => {
  it('never shows the old result for the new ink, and still recognizes the new ink', async () => {
    const { recognizer, state } = fakeRecognizer({ delayMs: 100 });
    const s = new RecognitionScheduler(recognizer, { debounceMs: 400, onChange: () => {} });
    s.update([mkLine(0, 'a')]);
    await vi.advanceTimersByTimeAsync(410); // 'a' is running
    s.update([mkLine(0, 'a2')]); // user edits
    expect(s.statusOf(mkLine(0, 'a2')).state).toBe('idle');
    await vi.advanceTimersByTimeAsync(90); // 'a' finishes
    expect(s.statusOf(mkLine(0, 'a2')).state).toBe('idle'); // old answer not applied to new ink
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.statusOf(mkLine(0, 'a2')).state).toBe('done');
    expect(state.calls).toBe(2);
  });
});

describe('invalidate', () => {
  it('re-recognizes everything', async () => {
    const { recognizer, state, texts } = fakeRecognizer();
    const s = new RecognitionScheduler(recognizer, { debounceMs: 100, onChange: () => {} });
    s.update([mkLine(0, 'a')]);
    await vi.advanceTimersByTimeAsync(150);
    texts[0] = '5×5=';
    s.invalidate();
    expect(s.statusOf(mkLine(0, 'a')).state).toBe('idle');
    await vi.advanceTimersByTimeAsync(150);
    expect(state.calls).toBe(2);
    const status = s.statusOf(mkLine(0, 'a'));
    expect(status).toMatchObject({ state: 'done', text: '5×5=' });
  });

  it('discards a result that was already in flight when invalidated', async () => {
    const { recognizer, state, texts } = fakeRecognizer({ delayMs: 100 });
    const s = new RecognitionScheduler(recognizer, { debounceMs: 100, onChange: () => {} });
    s.update([mkLine(0, 'a')]);
    await vi.advanceTimersByTimeAsync(110); // running with the old text
    texts[0] = '9+9=';
    s.invalidate();
    await vi.advanceTimersByTimeAsync(95); // old request returns: must be discarded
    expect(s.statusOf(mkLine(0, 'a')).state).not.toBe('done');
    await vi.advanceTimersByTimeAsync(500);
    expect(state.calls).toBe(2);
    expect(s.statusOf(mkLine(0, 'a'))).toMatchObject({ state: 'done', text: '9+9=' });
  });
});

describe('failures and shutdown', () => {
  it('marks a failing line as failed and does not retry in a loop', async () => {
    const { recognizer, state } = fakeRecognizer({ fail: true });
    const s = new RecognitionScheduler(recognizer, { debounceMs: 100, onChange: () => {} });
    s.update([mkLine(0, 'a')]);
    await vi.advanceTimersByTimeAsync(150);
    expect(s.statusOf(mkLine(0, 'a'))).toEqual({ state: 'failed' });
    await vi.advanceTimersByTimeAsync(5000);
    expect(state.calls).toBe(1);
  });

  it('does nothing after dispose', async () => {
    const { recognizer, state } = fakeRecognizer();
    const s = new RecognitionScheduler(recognizer, { debounceMs: 100, onChange: () => {} });
    s.update([mkLine(0, 'a')]);
    s.dispose();
    await vi.advanceTimersByTimeAsync(1000);
    expect(state.calls).toBe(0);
  });

  it('notifies on status changes', async () => {
    const { recognizer } = fakeRecognizer({ delayMs: 20 });
    let changes = 0;
    const s = new RecognitionScheduler(recognizer, { debounceMs: 100, onChange: () => changes++ });
    s.update([mkLine(0, 'a')]);
    await vi.advanceTimersByTimeAsync(200);
    expect(changes).toBeGreaterThanOrEqual(2); // running, then done
  });
});