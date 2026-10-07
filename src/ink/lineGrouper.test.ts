import { describe, expect, it } from 'vitest';
import { groupLines } from './lineGrouper';
import { dot, line, tiltedEquation } from './testUtils';

// Digit-like strokes: vertical bars 40px tall. Bounds are about [99, 141] for a row at y=100.
const digit = (id: string, x: number, top = 100) => line(id, x, top, x, top + 40);
const ids = (l: { strokes: readonly { id: string }[] }) => l.strokes.map((s) => s.id);

describe('groupLines', () => {
  it('returns nothing for an empty page', () => {
    expect(groupLines([])).toEqual([]);
  });

  it('puts strokes at the same height on one line', () => {
    const lines = groupLines([digit('a', 100), digit('b', 130), digit('c', 160)]);
    expect(lines).toHaveLength(1);
    expect(ids(lines[0]!)).toEqual(['a', 'b', 'c']);
  });

  it('separates rows and orders them top to bottom with indices', () => {
    const lines = groupLines([digit('low', 100, 300), digit('top', 100, 100), digit('mid', 100, 200)]);
    expect(lines.map((l) => l.index)).toEqual([0, 1, 2]);
    expect(lines.map((l) => ids(l)[0])).toEqual(['top', 'mid', 'low']);
  });

  it('keeps a minus sign (a flat stroke mid-height) on its line', () => {
    const lines = groupLines([digit('a', 100), line('minus', 110, 120, 125, 120), digit('b', 140)]);
    expect(lines).toHaveLength(1);
  });

  it('keeps the two bars of "=" on the line', () => {
    const lines = groupLines([
      digit('a', 100),
      line('bar1', 130, 125, 150, 125),
      line('bar2', 130, 135, 150, 135),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.strokes).toHaveLength(3);
  });

  it('keeps a decimal point on the baseline, even slightly below it', () => {
    expect(groupLines([digit('a', 100), dot('p', 115, 140), digit('b', 130)])).toHaveLength(1);
    expect(groupLines([digit('a', 100), dot('p', 115, 146), digit('b', 130)])).toHaveLength(1);
  });

  it('keeps the crossing strokes of "+" together', () => {
    const lines = groupLines([
      digit('a', 100),
      line('plusH', 120, 120, 140, 120),
      line('plusV', 130, 110, 130, 130),
    ]);
    expect(lines).toHaveLength(1);
  });

  it('does not merge rows that are close together but not overlapping', () => {
    // second row starts 9px below the first row ends
    const lines = groupLines([digit('a', 100, 100), digit('b', 100, 150)]);
    expect(lines).toHaveLength(2);
  });

  it('assigns a small mark to the nearer row', () => {
    const lines = groupLines([digit('a', 100, 100), digit('b', 100, 150), line('minus', 120, 170, 140, 170)]);
    expect(lines).toHaveLength(2);
    expect(ids(lines[1]!)).toContain('minus');
    expect(ids(lines[0]!)).not.toContain('minus');
  });

  it('gives the same grouping whatever order the strokes were drawn in', () => {
    const strokes = [
      digit('a', 100),
      line('minus', 110, 120, 125, 120),
      digit('b', 140),
      digit('c', 100, 250),
      dot('p', 115, 290),
    ];
    const normal = groupLines(strokes).map((l) => new Set(ids(l)));
    const reversed = groupLines([...strokes].reverse()).map((l) => new Set(ids(l)));
    expect(reversed).toEqual(normal);
    expect(normal).toHaveLength(2);
  });

  it('lists each line’s strokes in drawing order, even if they merged late', () => {
    // the minus is drawn first and only joins the line when the digit arrives
    const lines = groupLines([line('minus', 110, 120, 125, 120), digit('a', 100)]);
    expect(ids(lines[0]!)).toEqual(['minus', 'a']);
  });

  it('reports the union of the stroke bounds', () => {
    const [l] = groupLines([digit('a', 100), digit('b', 200)]);
    expect(l!.bounds).toEqual({ left: 99, top: 99, right: 201, bottom: 141 });
  });
});

describe('signature (dirty-line detection)', () => {
  it('is stable for identical ink and changes when a stroke is added or removed', () => {
    const base = [digit('a', 100), digit('b', 130)];
    const s1 = groupLines(base)[0]!.signature;
    expect(groupLines(base)[0]!.signature).toBe(s1);
    expect(groupLines([...base, digit('c', 160)])[0]!.signature).not.toBe(s1);
    expect(groupLines([base[0]!])[0]!.signature).not.toBe(s1);
  });

  it('leaves untouched lines alone when another line changes', () => {
    const row1 = [digit('a', 100, 100)];
    const before = groupLines([...row1, digit('b', 100, 300)]);
    const after = groupLines([...row1, digit('b', 100, 300), digit('c', 130, 300)]);
    expect(after[0]!.signature).toBe(before[0]!.signature);
    expect(after[1]!.signature).not.toBe(before[1]!.signature);
  });
});
describe('groupLines: diagonal writing', () => {
  const deg = (d: number) => (d * Math.PI) / 180;

  it.each([-45, -30, -20, -10, 10, 20, 30, 45])('keeps an equation written at %i degrees on one line', (d) => {
    const lines = groupLines(tiltedEquation(deg(d)));
    expect(lines).toHaveLength(1);
    expect(lines[0]!.strokes).toHaveLength(8);
    expect(lines[0]!.angle).toBeCloseTo(deg(d), 1);
  });

  it('leaves level writing alone (angle 0, bounds as the answer anchor)', () => {
    const lines = groupLines(tiltedEquation(0));
    expect(lines).toHaveLength(1);
    expect(lines[0]!.angle).toBe(0);
    expect(lines[0]!.endBounds).toEqual(lines[0]!.bounds);
  });

  it('puts the end box on the "=" of a rising line', () => {
    const [l] = groupLines(tiltedEquation(deg(-30)));
    // the "=" is the right-most, highest part of the rising line
    expect(l!.endBounds.right).toBe(l!.bounds.right);
    expect(l!.endBounds.top).toBe(l!.bounds.top);
    expect(l!.endBounds.left).toBeGreaterThan(l!.bounds.left + 150);
  });

  it('keeps two parallel diagonal equations apart', () => {
    const a = tiltedEquation(deg(-25), 'a');
    const b = tiltedEquation(deg(-25), 'b').map((s) => ({
      ...s,
      points: s.points.map((p) => ({ ...p, x: p.x - 100, y: p.y + 260 })),
    }));
    expect(groupLines([...a, ...b]).length).toBe(2);
  });

  it('does not tilt-merge two ordinary rows', () => {
    const rows = groupLines([digit('a', 100, 100), digit('b', 130, 100), digit('c', 100, 160), digit('d', 130, 160)]);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.angle === 0)).toBe(true);
  });
});

describe('groupLines: speed', () => {
  it('groups 300 strokes (30 rows) well inside one frame', () => {
    const strokes = [];
    for (let r = 0; r < 30; r++) {
      for (let k = 0; k < 10; k++) strokes.push(line(`s${r}_${k}`, 50 + k * 30, 50 + r * 60, 60 + k * 30, 90 + r * 60, 15));
    }
    groupLines(strokes); // warm up
    const t = performance.now();
    const lines = groupLines(strokes);
    const ms = performance.now() - t;
    expect(lines).toHaveLength(30);
    expect(ms).toBeLessThan(16); // was ~14 ms before the incremental merge, now about 1-2 ms
  });
});

describe('groupLines: equations side by side', () => {
  /** "1 + 1 =" laid out from x0 at row y (digit height 40). */
  const eq = (tag: string, x0: number, y = 100) => [
    line(`${tag}1`, x0 + 10, y, x0 + 10, y + 40),
    line(`${tag}ph`, x0 + 30, y + 20, x0 + 50, y + 20),
    line(`${tag}pv`, x0 + 40, y + 10, x0 + 40, y + 30),
    line(`${tag}2`, x0 + 70, y, x0 + 70, y + 40),
    line(`${tag}e1`, x0 + 90, y + 15, x0 + 120, y + 15),
    line(`${tag}e2`, x0 + 90, y + 27, x0 + 120, y + 27),
  ];

  it('splits two equations that share a row after the first "="', () => {
    const lines = groupLines([...eq('a', 0), ...eq('b', 140)]);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.strokes.map((s) => s.id)).toEqual(['a1', 'aph', 'apv', 'a2', 'ae1', 'ae2']);
    expect(lines[1]!.strokes).toHaveLength(6);
    expect(lines[0]!.bounds.right).toBeLessThan(lines[1]!.bounds.left);
  });

  it('splits at a very wide gap even without a second "="', () => {
    const lines = groupLines([digit('a', 100), digit('b', 130), digit('c', 400), digit('d', 430)]);
    expect(lines).toHaveLength(2);
  });

  it('keeps one equation (with its own answer written after the "=") together', () => {
    const lines = groupLines([...eq('a', 0), line('ans', 150, 100, 150, 140)]);
    expect(lines).toHaveLength(1);
  });
});
