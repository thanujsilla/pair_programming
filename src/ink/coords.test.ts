import { describe, expect, it } from 'vitest';
import { backingSize, clientToLocal, localToDevice, sanitizeDpr } from './coords';

describe('sanitizeDpr', () => {
  it('passes normal values through', () => {
    expect(sanitizeDpr(1)).toBe(1);
    expect(sanitizeDpr(2)).toBe(2);
    expect(sanitizeDpr(1.5)).toBe(1.5);
  });
  it('falls back to 1 for bad values and caps huge ones', () => {
    expect(sanitizeDpr(0)).toBe(1);
    expect(sanitizeDpr(-2)).toBe(1);
    expect(sanitizeDpr(NaN)).toBe(1);
    expect(sanitizeDpr(Infinity)).toBe(1);
    expect(sanitizeDpr(10)).toBe(4);
  });
});

describe('clientToLocal', () => {
  it('subtracts the canvas offset', () => {
    expect(clientToLocal(150, 90, { left: 100, top: 40 })).toEqual({ x: 50, y: 50 });
  });
  it('can go negative outside the canvas', () => {
    expect(clientToLocal(90, 30, { left: 100, top: 40 })).toEqual({ x: -10, y: -10 });
  });
});

describe('backingSize', () => {
  it('scales the backing store by dpr', () => {
    expect(backingSize(800, 600, 1)).toMatchObject({ width: 800, height: 600, scaleX: 1, scaleY: 1 });
    expect(backingSize(800, 600, 2)).toMatchObject({ width: 1600, height: 1200, scaleX: 2, scaleY: 2 });
  });
  it('rounds at fractional ratios and reports the exact scale', () => {
    const b = backingSize(333, 200, 1.5);
    expect(b.width).toBe(500); // 499.5 rounds up
    expect(b.scaleX).toBeCloseTo(500 / 333, 10);
    expect(b.height).toBe(300);
  });
  it('never returns a zero-sized canvas', () => {
    const b = backingSize(0, 0, 2);
    expect(b.width).toBeGreaterThanOrEqual(1);
    expect(b.height).toBeGreaterThanOrEqual(1);
  });
});

describe('localToDevice', () => {
  it('multiplies by dpr', () => {
    expect(localToDevice(10, 20, 2)).toEqual({ x: 20, y: 40 });
    expect(localToDevice(10, 20, 1.25)).toEqual({ x: 12.5, y: 25 });
  });
  it('round-trips with the inverse', () => {
    const d = localToDevice(37.5, 12, 2);
    expect({ x: d.x / 2, y: d.y / 2 }).toEqual({ x: 37.5, y: 12 });
  });
});