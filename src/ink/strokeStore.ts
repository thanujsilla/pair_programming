import { eraseCircle, strokeHit } from './eraser';
import type { Stroke } from './types';

const MAX_HISTORY = 200; // bounded undo stack keeps memory flat in long sessions

type Snapshot = readonly Stroke[];

/**
 * Single source of truth for all ink. History is a stack of immutable
 * snapshots (cheap: strokes are shared between snapshots, never copied).
 * A "gesture" groups many small changes (one eraser drag) into one undo step.
 */
export class StrokeStore {
  version = 0;

  private current: Snapshot = [];
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private listeners = new Set<() => void>();
  private inGesture = false;
  private gestureBase: Snapshot | null = null;
  private idCounter = 0;

  get strokes(): Snapshot {
    return this.current;
  }
  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  nextId(): string {
    return `s${++this.idCounter}`;
  }

  addStroke(stroke: Stroke): void {
    if (stroke.points.length === 0) return;
    this.apply([...this.current, stroke]);
  }

  /** Stroke eraser: remove every whole stroke the circle touches. */
  eraseStrokesAt(x: number, y: number, radius: number): boolean {
    const next = this.current.filter((s) => !strokeHit(s, x, y, radius));
    if (next.length === this.current.length) return false;
    this.apply(next);
    return true;
  }

  /** Pixel eraser: cut strokes inside the circle, keeping the remaining pieces. */
  erasePixelsAt(x: number, y: number, radius: number): boolean {
    let changed = false;
    const next: Stroke[] = [];
    for (const s of this.current) {
      const pieces = eraseCircle(s, x, y, radius, () => this.nextId());
      if (pieces === null) {
        next.push(s);
      } else {
        changed = true;
        next.push(...pieces);
      }
    }
    if (!changed) return false;
    this.apply(next);
    return true;
  }

  /** Remove the strokes with these ids as ONE undo step (used by scratch-to-erase). */
  removeStrokes(ids: ReadonlySet<string>): boolean {
    const next = this.current.filter((s) => !ids.has(s.id));
    if (next.length === this.current.length) return false;
    this.apply(next);
    return true;
  }

  clear(): void {
    if (this.current.length === 0) return;
    this.endGesture();
    this.apply([]);
  }

  beginGesture(): void {
    this.inGesture = true;
    this.gestureBase = null;
  }

  endGesture(): void {
    if (!this.inGesture) return;
    this.inGesture = false;
    const base = this.gestureBase;
    this.gestureBase = null;
    if (base) {
      this.pushUndo(base);
      this.redoStack = [];
      this.emit(); // undo became available
    }
  }

  undo(): boolean {
    this.endGesture();
    const prev = this.undoStack.pop();
    if (!prev) return false;
    this.redoStack.push(this.current);
    this.current = prev;
    this.emit();
    return true;
  }

  redo(): boolean {
    this.endGesture();
    const next = this.redoStack.pop();
    if (!next) return false;
    this.pushUndo(this.current);
    this.current = next;
    this.emit();
    return true;
  }

  private apply(next: Snapshot): void {
    if (this.inGesture) {
      if (this.gestureBase === null) this.gestureBase = this.current;
    } else {
      this.pushUndo(this.current);
      this.redoStack = [];
    }
    this.current = next;
    this.emit();
  }

  private pushUndo(s: Snapshot): void {
    this.undoStack.push(s);
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
  }

  private emit(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }
}