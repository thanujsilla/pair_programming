import { useEffect, useState } from 'react';
import type { Pipeline } from '../recognition/pipeline';
import { PerfMonitor } from './perfMonitor';
import type { PerfSnapshot } from './perfMonitor';

const EMPTY: PerfSnapshot = { fps: 0, worstFrameMs: 0, droppedFrames: 0, longTasks: 0 };

/** Small live readout: frames per second, the worst stall in the last 3 s, and model time. */
export function PerfHud({ pipeline }: { pipeline: Pipeline }) {
  const [snap, setSnap] = useState<PerfSnapshot>(EMPTY);
  const [modelMs, setModelMs] = useState<number | null>(null);

  useEffect(() => {
    const monitor = new PerfMonitor();
    monitor.start();
    const timer = setInterval(() => {
      setSnap(monitor.snapshot());
      setModelMs(pipeline.lastRecognitionMs);
    }, 250);
    return () => {
      clearInterval(timer);
      monitor.stop();
    };
  }, [pipeline]);

  return (
    <div
      className="hud"
      aria-label="Performance"
      data-fps={snap.fps.toFixed(1)}
      data-worst={snap.worstFrameMs.toFixed(0)}
      data-long={snap.longTasks}
    >
      <div>
        <b>{snap.fps.toFixed(0)}</b> fps
      </div>
      <div>
        worst frame <b>{snap.worstFrameMs.toFixed(0)}</b> ms
      </div>
      <div>
        dropped <b>{snap.droppedFrames}</b> · long tasks <b>{snap.longTasks}</b>
      </div>
      <div>model {modelMs === null ? '–' : `${modelMs.toFixed(0)} ms`}</div>
    </div>
  );
}