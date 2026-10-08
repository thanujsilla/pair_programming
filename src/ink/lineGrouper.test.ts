import { describe, expect, it } from 'vitest';
import { groupLines } from './lineGrouper';
import { columnEquation, dot, line, tiltedEquation } from './testUtils';

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

  it('leaves level writing alone (angle 0); the answer anchor is the "=" at the end', () => {
    const lines = groupLines(tiltedEquation(0));
    expect(lines).toHaveLength(1);
    expect(lines[0]!.angle).toBe(0);
    expect(lines[0]!.endBounds.right).toBeCloseTo(lines[0]!.bounds.right, 6);
    expect(lines[0]!.endBounds.left).toBeGreaterThan(lines[0]!.bounds.left + 150);
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
    // best of several runs: a single run can be slowed by other test files running in parallel
    let ms = Infinity;
    let lines = groupLines(strokes);
    for (let i = 0; i < 7; i++) {
      const t = performance.now();
      lines = groupLines(strokes);
      ms = Math.min(ms, performance.now() - t);
    }
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

describe('writing in any direction (grouping)', () => {
  it.each([90, -90, 180])('joins an equation written at %i degrees into one line', (deg) => {
    const lines = groupLines(tiltedEquation((deg * Math.PI) / 180));
    expect(lines).toHaveLength(1);
    expect(Math.abs(lines[0]!.angle)).toBeGreaterThan(1.4);
  });

  it('puts the answer anchor at the "=" end of a downward column', () => {
    const [line] = groupLines(tiltedEquation(Math.PI / 2));
    expect(line!.endBounds.top).toBeGreaterThan(line!.bounds.top + (line!.bounds.bottom - line!.bounds.top) / 2);
  });

  it('does not merge two separate horizontal lines stacked in a column', () => {
    const a = tiltedEquation(0, 'a');
    const b = tiltedEquation(0, 'b').map((s) => ({ ...s, points: s.points.map((p) => ({ ...p, y: p.y + 140 })) }));
    expect(groupLines([...a, ...b])).toHaveLength(2);
  });
});

describe('answer follows the orientation of the "="', () => {
  const deg = (d: number) => (d * Math.PI) / 180;
  const tailOfEquation = (d: number) => groupLines(tiltedEquation(deg(d)))[0]!;

  it('starts just past the "=" in the reading direction, whatever the angle', () => {
    for (const d of [0, 30, 90, -90, 180, 45]) {
      const line = tailOfEquation(d);
      // the "=" is the last glyph (index 3), centred 3*85+27.5 along the writing direction from the first glyph origin
      const eqCentre = {
        x: 400 + (3 * 85 + 27.5) * Math.cos(deg(d)),
        y: 400 + (3 * 85 + 27.5) * Math.sin(deg(d)),
      };
      const along = (line.tail.x - eqCentre.x) * Math.cos(deg(d)) + (line.tail.y - eqCentre.y) * Math.sin(deg(d));
      const across = -(line.tail.x - eqCentre.x) * Math.sin(deg(d)) + (line.tail.y - eqCentre.y) * Math.cos(deg(d));
      expect(along).toBeGreaterThan(20); // past the "="
      expect(along).toBeLessThan(45);
      expect(Math.abs(across)).toBeLessThan(8); // level with it
    }
  });

  it('is below the "=" for a column read downwards and left of it for upside-down writing', () => {
    const down = tailOfEquation(90);
    expect(down.tail.y).toBeGreaterThan(down.endBounds.bottom - 5);
    const upsideDown = tailOfEquation(180);
    expect(upsideDown.tail.x).toBeLessThan(upsideDown.endBounds.left + 5);
  });
});

describe('a column of upright glyphs (grouping)', () => {
  it.each([true, false])('is one line (written downwards: %s)', (down) => {
    const lines = groupLines(columnEquation(down));
    expect(lines).toHaveLength(1);
    expect(Math.abs(lines[0]!.angle)).toBeGreaterThan(1.4);
  });

  it('puts the "=" end at the bottom for a column written downwards', () => {
    const [l] = groupLines(columnEquation(true));
    expect(l!.endBounds.top).toBeGreaterThan(l!.bounds.top + (l!.bounds.bottom - l!.bounds.top) / 2);
  });
});

describe('every direction, turned or sloped', () => {
  const sheared = (angle: number) => {
    const k = Math.tan(angle);
    return tiltedEquation(0).map((s) => ({ ...s, points: s.points.map((p) => ({ ...p, y: p.y + k * (p.x - 400) })) }));
  };

  it('groups an equation turned by any angle into one line', () => {
    for (let d = -180; d < 180; d += 5) {
      expect(groupLines(tiltedEquation((d * Math.PI) / 180)), `turned ${d} deg`).toHaveLength(1);
    }
  });

  it('groups upright digits on a rising or falling slope into one line', () => {
    for (let d = -60; d <= 60; d += 5) {
      expect(groupLines(sheared((d * Math.PI) / 180)), `sloped ${d} deg`).toHaveLength(1);
    }
  });
});