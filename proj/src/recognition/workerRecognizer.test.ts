import { afterEach, describe, expect, it, vi } from 'vitest';
import { TypedRecognizer } from './typedRecognizer';
import { loopbackWorker } from './testWorker';
import { WorkerRecognizer } from './workerRecognizer';
import type { WorkerLike } from './workerRecognizer';

const registry = { typed: () => new TypedRecognizer() };
const input = (i: number) => ({ lineIndex: i, strokes: [] });

afterEach(() => vi.useRealTimers());

describe('WorkerRecognizer', () => {
  it('becomes ready and recognizes', async () => {
    const r = new WorkerRecognizer(loopbackWorker(registry), { kind: 'typed' });
    await r.ready;
    r.configure({ texts: ['1+1='] });
    expect(await r.recognize(input(0))).toEqual({ text: '1+1=' });
  });

  it('matches concurrent requests to the right callers', async () => {
    const r = new WorkerRecognizer(loopbackWorker(registry), { kind: 'typed' });
    r.configure({ texts: ['a', 'b', 'c'] });
    const results = await Promise.all([r.recognize(input(2)), r.recognize(input(0)), r.recognize(input(1))]);
    expect(results.map((x) => x.text)).toEqual(['c', 'a', 'b']);
  });

  it('applies configure before later recognize calls', async () => {
    const r = new WorkerRecognizer(loopbackWorker(registry), { kind: 'typed' });
    r.configure({ texts: ['old'] });
    const first = r.recognize(input(0));
    r.configure({ texts: ['new'] });
    const second = r.recognize(input(0));
    expect((await first).text).toBe('old');
    expect((await second).text).toBe('new');
  });

  it('rejects when the recognizer fails to start, now and later', async () => {
    const r = new WorkerRecognizer(loopbackWorker({}), { kind: 'typed' });
    await expect(r.ready).rejects.toThrow(/Unknown recognizer/);
    await expect(r.recognize(input(0))).rejects.toThrow(/Unknown recognizer/);
  });

  it('rejects pending requests and later calls when the worker crashes', async () => {
    const w = loopbackWorker(registry);
    const r = new WorkerRecognizer(w, { kind: 'typed' });
    await r.ready;
    const p = r.recognize(input(0));
    w.crash('out of memory');
    await expect(p).rejects.toThrow('out of memory');
    await expect(r.recognize(input(0))).rejects.toThrow('out of memory');
  });

  it('times out, and ignores a late answer', async () => {
    vi.useFakeTimers();
    let deliver: (m: unknown) => void = () => {};
    const silent: WorkerLike = {
      postMessage: () => {},
      terminate: () => {},
      listen: (m) => void (deliver = m as (m: unknown) => void),
    };
    const r = new WorkerRecognizer(silent, { kind: 'typed', timeoutMs: 1000 });
    const p = r.recognize(input(0));
    const assertion = expect(p).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(1001);
    await assertion;
    expect(() => deliver({ type: 'result', id: 1, text: 'late' })).not.toThrow();
  });

  it('dispose rejects pending work, terminates the worker, and refuses new work', async () => {
    const w = loopbackWorker(registry);
    const r = new WorkerRecognizer(w, { kind: 'typed' });
    const p = r.recognize(input(0));
    r.dispose();
    await expect(p).rejects.toThrow(/disposed/);
    expect(w.terminated).toBe(true);
    await expect(r.recognize(input(0))).rejects.toThrow(/disposed/);
    r.dispose(); // twice is fine
  });
});
