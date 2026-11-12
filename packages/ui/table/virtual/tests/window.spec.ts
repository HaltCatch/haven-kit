import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTreeSelection } from '../../../../../tests/ui/tree-selection-support';
import { installVirtualGeometry } from './geometry';
import { VirtualWindowHarness } from './window-harness';

let geometry: ReturnType<typeof installVirtualGeometry>;
beforeEach(() => {
  setupTreeSelection();
  geometry = installVirtualGeometry();
});
afterEach(() => {
  TestBed.resetTestingModule();
  geometry.restore();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const setup = async () => {
  const fixture = TestBed.createComponent(VirtualWindowHarness);
  await fixture.whenStable();
  return { fixture, host: fixture.componentInstance, root: fixture.nativeElement as HTMLElement };
};

describe('native virtual table window lifecycle', () => {
  it('keeps default paged tables free of virtual geometry observers and disconnects after disabling', async () => {
    const fixture = TestBed.createComponent(VirtualWindowHarness),
      host = fixture.componentInstance;
    host.config.set(undefined);
    await fixture.whenStable();
    expect([...geometry.observers].flatMap((observer) => [...observer.targets])).toHaveLength(0);
    expect(host.window.entries()).toHaveLength(10);
    host.config.set({ estimateRowHeight: 48 });
    await fixture.whenStable();
    expect([...geometry.observers].some((observer) => observer.targets.size > 0)).toBe(true);
    host.config.set(undefined);
    await fixture.whenStable();
    expect([...geometry.observers].flatMap((observer) => [...observer.targets])).toHaveLength(0);
  });

  it('uses actual caption/header margins and retains one far-away editor through zero-height geometry', async () => {
    const { fixture, host, root } = await setup();
    expect(host.window.virtualizer.options().scrollMargin).toBe(72);
    expect(host.window.virtualizer.options().scrollPaddingStart).toBe(48);
    host.editing.set('string:r900');
    await fixture.whenStable();
    const editor = root.querySelector('tr[data-virtual-row-id="string:r900"]');
    expect(editor).not.toBeNull();
    expect(root.querySelectorAll('tr[data-virtual-row-id]').length).toBeLessThan(20);
    geometry.setHeight(0);
    geometry.notifyResize(host.viewport()!.nativeElement);
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    await fixture.whenStable();
    expect(root.querySelector('tr[data-virtual-row-id="string:r900"]')).toBe(editor);
    expect(root.querySelectorAll('tr[data-virtual-row-id]').length).toBeLessThan(4);
    host.editing.set(undefined);
    host.owner.set('replacement');
    await fixture.whenStable();
    expect(root.querySelector('tr[data-virtual-row-id="string:r900"]')).toBeNull();
  });

  it('preserves a focused row while scrolling, cleans disconnected native elements and keeps DOM bounded', async () => {
    const { fixture, host, root } = await setup();
    const first = root.querySelector<HTMLButtonElement>('tbody button')!;
    first.focus();
    host.viewport()!.nativeElement.scrollTo({ top: 24_000 });
    await fixture.whenStable();
    await Promise.resolve();
    expect(root.contains(first)).toBe(true);
    expect(document.activeElement).toBe(first);
    expect(root.querySelectorAll('tr[data-virtual-row-id]').length).toBeLessThan(20);
    expect(host.window.virtualizer().elementsCache.size).toBeLessThan(20);
    first.blur();
    await fixture.whenStable();
    await Promise.resolve();
    expect(root.contains(first)).toBe(false);
  });

  it('lets native ResizeObserver update variable row size and invalidates unseen measurements once per style/locale change', async () => {
    const { fixture, host, root } = await setup();
    const row = root.querySelector<HTMLTableRowElement>('tr[data-virtual-row-id="number:0"]')!;
    geometry.notifyResize(row, 132);
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    await fixture.whenStable();
    expect(host.window.virtualizer().measurementsCache[0]?.size).toBe(132);
    const measure = vi.spyOn(host.window.virtualizer(), 'measure');
    host.styleKey.set(1);
    await fixture.whenStable();
    await Promise.resolve();
    const settled = measure.mock.calls.length;
    expect(settled).toBeGreaterThan(0);
    await fixture.whenStable();
    await Promise.resolve();
    expect(measure).toHaveBeenCalledTimes(settled);
    TestBed.inject(TranslocoService).setActiveLang('zh-CN');
    await fixture.whenStable();
    expect(measure.mock.calls.length).toBeGreaterThan(settled);
    fixture.destroy();
    await Promise.resolve();
    expect([...geometry.observers].flatMap((observer) => [...observer.targets])).toHaveLength(0);
  });

  it('defers native row resize delivery to a frame and cancels queued measurements on destroy', async () => {
    const { fixture, host, root } = await setup();
    const frames = new Map<number, FrameRequestCallback>();
    let next = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++next, callback);
      return next;
    });
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
    const row = root.querySelector<HTMLTableRowElement>('tr[data-virtual-row-id="number:0"]')!;
    const resize = vi.spyOn(host.window.virtualizer(), 'resizeItem');
    geometry.notifyResize(row, 132);
    expect(resize).not.toHaveBeenCalled();
    expect(frames.size).toBeGreaterThan(0);
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(performance.now());
    await fixture.whenStable();
    expect(host.window.virtualizer().measurementsCache[0]?.size).toBe(132);
    const before = new Set(frames.keys());
    geometry.notifyResize(row, 164);
    const queued = [...frames.keys()].filter((id) => !before.has(id));
    expect(queued).toHaveLength(1);
    fixture.destroy();
    expect(cancel).toHaveBeenCalledWith(queued[0]);
    expect(frames.has(queued[0]!)).toBe(false);
    expect([...geometry.observers].flatMap((observer) => [...observer.targets])).toHaveLength(0);
  });

  it('refreshes keyed mappings on sorting and resets vertical origin without changing horizontal scroll', async () => {
    const { fixture, host } = await setup();
    const viewport = host.viewport()!.nativeElement;
    viewport.scrollLeft = 140;
    viewport.scrollTo({ top: 4800 });
    await fixture.whenStable();
    host.source.update((rows) => [...rows].reverse());
    await fixture.whenStable();
    expect(viewport.scrollTop).toBe(0);
    expect(viewport.scrollLeft).toBe(140);
    expect(host.window.virtualizer.options().getItemKey(0)).toBe('string:r999');
    expect(
      host.window.entries().some((entry) => entry.kind === 'row' && entry.row.id === 'string:r999'),
    ).toBe(true);
  });
});
