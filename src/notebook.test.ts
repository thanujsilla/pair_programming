import { describe, expect, it, vi } from 'vitest';
import { MAX_PAGES, Notebook } from './notebook';

describe('Notebook', () => {
  it('starts with one page', () => {
    const nb = new Notebook();
    expect(nb.count).toBe(1);
    expect(nb.index).toBe(0);
  });

  it('adds a page after the current one and opens it', () => {
    const nb = new Notebook();
    const first = nb.page;
    const second = nb.addPage()!;
    expect(nb.count).toBe(2);
    expect(nb.page).toBe(second);
    expect(second).not.toBe(first);
  });

  it('keeps each page\'s ink separate and flips between pages without losing it', () => {
    const nb = new Notebook();
    nb.page.store.addStroke({ id: 'a', points: [{ x: 1, y: 1, t: 0, p: 0.5 }], width: 2 });
    nb.addPage();
    expect(nb.page.store.strokes).toHaveLength(0);
    nb.previous();
    expect(nb.page.store.strokes).toHaveLength(1);
    nb.next();
    expect(nb.page.store.strokes).toHaveLength(0);
  });

  it('remembers the zoom of each page', () => {
    const nb = new Notebook();
    nb.page.view = { scale: 2, x: 5, y: 6 };
    nb.addPage();
    expect(nb.page.view.scale).toBe(1);
    nb.previous();
    expect(nb.page.view.scale).toBe(2);
  });

  it('does not go past either end', () => {
    const nb = new Notebook();
    nb.previous();
    expect(nb.index).toBe(0);
    nb.next();
    expect(nb.index).toBe(0);
    nb.addPage();
    nb.next();
    expect(nb.index).toBe(1);
    nb.goTo(99);
    expect(nb.index).toBe(1);
  });

  it('limits the number of pages', () => {
    const nb = new Notebook();
    for (let i = 0; i < MAX_PAGES + 5; i++) nb.addPage();
    expect(nb.count).toBe(MAX_PAGES);
    expect(nb.addPage()).toBeNull();
  });

  it('deletes the current page, or just clears the only one', () => {
    const nb = new Notebook();
    nb.page.store.addStroke({ id: 'a', points: [{ x: 1, y: 1, t: 0, p: 0.5 }], width: 2 });
    nb.deletePage();
    expect(nb.count).toBe(1);
    expect(nb.page.store.strokes).toHaveLength(0);
    nb.addPage();
    nb.deletePage();
    expect(nb.count).toBe(1);
    expect(nb.index).toBe(0);
  });

  it('tells listeners when the page changes', () => {
    const nb = new Notebook();
    const fn = vi.fn();
    nb.subscribe(fn);
    nb.addPage();
    nb.previous();
    nb.previous(); // already first: no change
    expect(fn).toHaveBeenCalledTimes(2);
  });
});