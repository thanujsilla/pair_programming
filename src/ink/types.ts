/** One sampled pen position. x/y are CSS pixels (not device pixels). */
export interface Point {
  x: number;
  y: number;
  /** event timestamp in ms */
  t: number;
  /** pressure 0..1 (0.5 when the device has no pressure) */
  p: number;
}

export interface Stroke {
  readonly id: string;
  readonly points: readonly Point[];
  /** line width in CSS pixels */
  readonly width: number;
  /** CSS color of the ink; strokes without one use the default ink color */
  readonly color?: string;
}

export type Tool = 'pen' | 'strokeEraser' | 'pixelEraser';