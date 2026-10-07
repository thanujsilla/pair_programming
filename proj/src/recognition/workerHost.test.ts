import { describe, expect, it } from 'vitest';
import { line } from '../ink/testUtils';
import type { Recognizer } from './types';
import { attachHost } from './workerHost';
import type { HostScope, RecognizerRegistry } from './workerHost';
import type { WorkerRequest, WorkerResponse } from './workerProtocol';

function setup(registry: RecognizerRegistry) {
  const out: WorkerResponse[] = [];
  const scope: HostScope = { onmessage: null, postMessage: (m) => void out.push(m) };
  attachHost(scope, registry);
  const send = (m: WorkerRequest) => scope.onmessage?.({ data: m });
  const settle = () => new Promise((r) => setTimeout(r, 20));
  return { out, send, settle };
}

const echo = (): Recognizer => ({
  id: 'echo',
  async recognize({ lineIndex, strokes }) {
    return { text: `${lineIndex}:${strokes.length}` };
  },
  dispose() {},
});

describe('workerHost', () => {
  it('answers init with ready', async () => {
    const t = setup({ echo });
    t.send({ type: 'init', kind: 'echo' });
    await t.settle();
    expect(t.out).toEqual([{ type: 'ready' }]);
  });

  it('recognizes and passes lineIndex and strokes through', async () => {
    const t = setup({ echo });
    t.send({ type: 'init', kind: 'echo' });
    t.send({ type: 'recognize', id: 7, lineIndex: 3, strokes: [line('a', 0, 0, 10, 0), line('b', 0, 5, 10, 5)] });
    await t.settle();
    expect(t.out[1]).toEqual({ type: 'result', id: 7, text: '3:2' });
  });

  it('includes confidence only when the model gives one', async () => {
    const t = setup({
      c: () => ({ id: 'c', recognize: async () => ({ text: '1=', confidence: 0.9 }), dispose() {} }),
    });
    t.send({ type: 'init', kind: 'c' });
    t.send({ type: 'recognize', id: 1, lineIndex: 0, strokes: [] });
    await t.settle();
    expect(t.out[1]).toEqual({ type: 'result', id: 1, text: '1=', confidence: 0.9 });
  });

  it('reports an error when recognize comes before init', async () => {
    const t = setup({ echo });
    t.send({ type: 'recognize', id: 1, lineIndex: 0, strokes: [] });
    await t.settle();
    expect(t.out[0]).toMatchObject({ type: 'error', id: 1 });
  });

  it('reports initError for an unknown kind, including inherited names', async () => {
    const t = setup({ echo });
    t.send({ type: 'init', kind: 'nope' });
    t.send({ type: 'init', kind: 'toString' });
    await t.settle();
    expect(t.out.map((m) => m.type)).toEqual(['initError', 'initError']);
  });

  it('waits for a slow init before handling recognize (strict ordering)', async () => {
    const t = setup({
      slow: async () => {
        await new Promise((r) => setTimeout(r, 30));
        return echo();
      },
    });
    t.send({ type: 'init', kind: 'slow' });
    t.send({ type: 'recognize', id: 1, lineIndex: 0, strokes: [] });
    await new Promise((r) => setTimeout(r, 80));
    expect(t.out.map((m) => m.type)).toEqual(['ready', 'result']);
  });

  it('forwards configure to the recognizer', async () => {
    let got: unknown;
    const t = setup({
      c: () => ({
        id: 'c',
        configure: (cfg) => void (got = cfg),
        recognize: async () => ({ text: '' }),
        dispose() {},
      }),
    });
    t.send({ type: 'init', kind: 'c' });
    t.send({ type: 'configure', config: { a: 1 } });
    await t.settle();
    expect(got).toEqual({ a: 1 });
  });

  it('keeps working after a recognizer throws or configure throws', async () => {
    let n = 0;
    const t = setup({
      flaky: () => ({
        id: 'flaky',
        configure: () => {
          throw new Error('bad config');
        },
        recognize: async () => {
          if (n++ === 0) throw new Error('boom');
          return { text: 'ok' };
        },
        dispose() {},
      }),
    });
    t.send({ type: 'init', kind: 'flaky' });
    t.send({ type: 'configure', config: {} });
    t.send({ type: 'recognize', id: 1, lineIndex: 0, strokes: [] });
    t.send({ type: 'recognize', id: 2, lineIndex: 0, strokes: [] });
    await t.settle();
    expect(t.out[1]).toEqual({ type: 'error', id: 1, message: 'boom' });
    expect(t.out[2]).toEqual({ type: 'result', id: 2, text: 'ok' });
  });
});
