import { describe, expect, it } from 'vitest';
import { summarizeFrames } from './perfMonitor';

describe('summarizeFrames', () => {
  it('handles no data', () => {
    expect(summarizeFrames([])).toEqual({ fps: 0, worstFrameMs: 0, droppedFrames: 0 });
  });

  it('reports ~60 fps and no drops for steady frames', () => {
    const s = summarizeFrames(Array(60).fill(1000 / 60));
    expect(s.fps).toBeCloseTo(60, 1);
    expect(s.droppedFrames).toBe(0);
    expect(s.worstFrameMs).toBeCloseTo(16.7, 1);
  });

  it('ignores small jitter but counts real stalls', () => {
    expect(summarizeFrames([16, 20, 24, 16]).droppedFrames).toBe(0);
    const s = summarizeFrames([16.7, 16.7, 2000, 16.7]);
    expect(s.worstFrameMs).toBe(2000);
    expect(s.droppedFrames).toBe(119);
    expect(s.fps).toBeLessThan(5);
  });
});
