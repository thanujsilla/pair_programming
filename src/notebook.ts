import { StrokeStore } from './ink/strokeStore';
import { IDENTITY_VIEW, type View } from './ink/view';
import { Pipeline } from './recognition/pipeline';
import type { Recognizer } from './recognition/types';

export const MAX_PAGES = 30;

/** One sheet of the notebook: its own ink, undo history, answers and zoom. */
export class Page {
  readonly store = new StrokeStore();
  /** zoom and pan are remembered per page */
  view: View = IDENTITY_VIEW;
  pipeline: Pipeline | null = null;

  readonly id: number;

  constructor(id: number) {
    this.id = id;
  }

  /** The recognition pipeline of this page, made when the page is first shown and kept afterwards. */
  ensurePipeline(recognizer: Recognizer): Pipeline {
    this.pipeline ??= new Pipeline(this.store, recognizer);
    return this.pipeline;
  }

  destroy(): void {
    this.pipeline?.destroy();
    this.pipeline = null;
  }
}

/**
 * A notebook of pages. Add a new page when one is full and flip between them; every page keeps
 * its own ink, undo/redo history, answers and zoom, so nothing is lost when you turn the page.
 */
export class Notebook {
  version = 0;

  private list: Page[] = [new Page(1)];
  private current = 0;
  private nextId = 2;
  private readonly listeners = new Set<() => void>();

  get pages(): readonly Page[] {
    return this.list;
  }

  get index(): number {
    return this.current;
  }

  get page(): Page {
    return this.list[this.current] as Page;
  }

  get count(): number {
    return this.list.length;
  }

  get canAdd(): boolean {
    return this.list.length < MAX_PAGES;
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  /** Add a blank page after the current one and open it. */
  addPage(): Page | null {
    if (!this.canAdd) return null;
    const page = new Page(this.nextId++);
    this.list.splice(this.current + 1, 0, page);
    this.current += 1;
    this.emit();
    return page;
  }

  goTo(index: number): void {
    const i = Math.min(this.list.length - 1, Math.max(0, Math.trunc(index)));
    if (i === this.current) return;
    this.current = i;
    this.emit();
  }

  next(): void {
    this.goTo(this.current + 1);
  }

  previous(): void {
    this.goTo(this.current - 1);
  }

  /** Remove the current page (the last remaining page is cleared instead). */
  deletePage(): void {
    if (this.list.length === 1) {
      this.page.store.clear();
      return;
    }
    const [gone] = this.list.splice(this.current, 1);
    gone?.destroy();
    this.current = Math.min(this.current, this.list.length - 1);
    this.emit();
  }

  /** Release every page's recognition pipeline (they are made again when a page is shown). */
  destroy(): void {
    for (const p of this.list) p.destroy();
  }

  private emit(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }
}