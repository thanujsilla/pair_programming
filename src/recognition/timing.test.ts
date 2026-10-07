import { describe, expect, it } from 'vitest';
import { line } from '../ink/testUtils';
import { StrokeStore } from '../ink/strokeStore';
import { Pipeline } from './pipeline';

describe('recognition timing', () => {
  it('is null before any result, then records how long the model took', async () => {
    const store = new StrokeStore();
    const p = new Pipeline(
      store,
      {
        id: 'slow',
        recognize: () => new Promise((r) => setTimeout(() => r({ text: '1+1=' }), 40)),
        dispose() {},
      },
      { debounceMs: 5 },
    );
    expect(p.lastRecognitionMs).toBeNull();
    store.addStroke(line('a', 0, 0, 100, 0));
    await new Promise((r) => setTimeout(r, 150));
    expect(p.lastRecognitionMs).toBeGreaterThanOrEqual(35);
    expect(p.lastRecognitionMs).toBeLessThan(120);
    p.destroy();
  });
});
