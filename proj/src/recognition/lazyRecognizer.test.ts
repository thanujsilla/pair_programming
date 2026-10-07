import { describe, expect, it } from 'vitest';
import { LazyWorkerRecognizer } from './lazyRecognizer';
import { loopbackWorker } from './testWorker';
import { TypedRecognizer } from './typedRecognizer';

const input = { lineIndex: 0, strokes: [] };
const good = { m: () => new TypedRecognizer() };

function make(registry: Parameters<typeof loopbackWorker>[0], workers: ReturnType<typeof loopbackWorker>[] = []) {
  return new LazyWorkerRecognizer(() => {
    const w = loopbackWorker(registry);
    workers.push(w);
    return w;
  }, { kind: 'm' });
}

describe('LazyWorkerRecognizer', () => {
  it('does not start a worker until it is needed', async () => {
    const workers: ReturnType<typeof loopbackWorker>[] = [];
    const r = make(good, workers);
    expect(workers).toHaveLength(0);
    r.warmUp();
    expect(workers).toHaveLength(1);
    await r.recognize(input);
    expect(workers).toHaveLength(1); // the same worker is reused
    r.dispose();
  });

  it('starts a new worker after dispose (React development re-mount)', async () => {
    const workers: ReturnType<typeof loopbackWorker>[] = [];
    const r = make(good, workers);
    await r.recognize(input);
    r.dispose();
    expect(workers[0].terminated).toBe(true);
    await r.recognize(input);
    expect(workers).toHaveLength(2);
    expect(workers[1].terminated).toBe(false);
    r.dispose();
    r.dispose(); // safe twice
  });

  it('reports a model that fails to load, and tells listeners', async () => {
    const r = make({
      m: () => {
        throw new Error('model file missing');
      },
    });
    let calls = 0;
    r.subscribe(() => calls++);
    r.warmUp();
    await new Promise((res) => setTimeout(res, 10));
    expect(r.lastError()).toMatch(/model file missing/);
    expect(calls).toBeGreaterThan(0);
    await expect(r.recognize(input)).rejects.toThrow();
    r.dispose();
    expect(r.lastError()).toBeNull();
  });

  it('clears the error once a recognition works again', async () => {
    let fail = true;
    const r = make({
      m: () => ({
        id: 'x',
        async recognize() {
          if (fail) throw new Error('boom');
          return { text: '1+1=' };
        },
        dispose() {},
      }),
    });
    await expect(r.recognize(input)).rejects.toThrow('boom');
    expect(r.lastError()).toBe('boom');
    fail = false;
    await expect(r.recognize(input)).resolves.toMatchObject({ text: '1+1=' });
    expect(r.lastError()).toBeNull();
    r.dispose();
  });
});