import { describe, expect, it } from 'vitest';
import { Virtualizer, defaultRangeExtractor } from '@tanstack/angular-virtual';
import type { VirtualItem } from '@tanstack/angular-virtual';
import { tableRowId } from '@haven/schema';
import { virtualTableEntries } from '../entries';
import type { HavenTableBodyEntry, HavenVirtualTableRow } from '../types';

// The mapper reads only native row.id; keep the row objects identifiable without an Angular host.
function rows(keys: readonly (string | number)[]): HavenVirtualTableRow[] {
  return keys.map((key) => {
    const original = { key };
    return { id: tableRowId(original, '/key'), original } as unknown as HavenVirtualTableRow;
  });
}
function native(
  values: readonly HavenVirtualTableRow[],
  sizes: readonly number[],
  retained: readonly number[] = [],
  margin = 0,
) {
  return new Virtualizer<HTMLElement, HTMLTableRowElement>({
    count: values.length,
    getScrollElement: () => null,
    getItemKey: (index) => values[index]!.id,
    estimateSize: (index) => sizes[index]!,
    initialRect: { width: 600, height: 45 },
    initialOffset: margin + 30,
    scrollMargin: margin,
    overscan: 0,
    rangeExtractor: (range) =>
      [...new Set([...defaultRangeExtractor(range), ...retained])].sort((a, b) => a - b),
    observeElementRect: () => () => {},
    observeElementOffset: () => () => {},
    scrollToFn: () => {},
  });
}
function spacers(entries: readonly HavenTableBodyEntry[]) {
  return entries.filter((entry) => entry.kind === 'spacer');
}
function rendered(entries: readonly HavenTableBodyEntry[]) {
  return entries.filter((entry) => entry.kind === 'row');
}
function geometry(entries: readonly HavenTableBodyEntry[], items: readonly VirtualItem[]) {
  const sizes = new Map(items.map((item) => [item.key, item.size]));
  return entries.reduce(
    (height, entry) => height + (entry.kind === 'spacer' ? entry.height : sizes.get(entry.key)!),
    0,
  );
}

describe('native virtual row and spacer entries', () => {
  it('preserves every gap around discontiguous retained rows, not only outer padding', () => {
    const values = rows(Array.from({ length: 30 }, (_, index) => index));
    const virtual = native(
      values,
      values.map(() => 10),
      [0, 20, 28],
    );
    const items = virtual.getVirtualItems();
    const entries = virtualTableEntries(values, items, virtual.getTotalSize(), 0);
    expect(items.map((item) => item.index)).toEqual([0, 3, 4, 5, 6, 7, 20, 28]);
    expect(spacers(entries).map((entry) => entry.height)).toEqual([20, 120, 70, 10]);
    expect(rendered(entries).map((entry) => entry.index)).toEqual(items.map((item) => item.index));
    expect(geometry(entries, items)).toBe(300);
    expect(new Set(entries.map((entry) => entry.key)).size).toBe(entries.length);
    for (const entry of rendered(entries)) expect(entry.row).toBe(values[entry.index]);
  });

  it('subtracts a nonzero header margin once while retaining native variable-size total geometry', () => {
    const values = rows(Array.from({ length: 25 }, (_, index) => index));
    const sizes = values.map((_, index) => 10 + index);
    const margin = 73;
    const virtual = native(values, sizes, [0, 22], margin);
    const items = virtual.getVirtualItems();
    const entries = virtualTableEntries(values, items, virtual.getTotalSize(), margin);
    expect(virtual.measurementsCache[0]!.start).toBe(margin);
    expect(virtual.getTotalSize()).toBe(sizes.reduce((sum, size) => sum + size, 0));
    expect(geometry(entries, items)).toBe(virtual.getTotalSize());
    const contiguous = virtualTableEntries(
      values,
      virtual.measurementsCache,
      virtual.getTotalSize(),
      margin,
    );
    expect(spacers(contiguous)).toEqual([]);
    expect(rendered(contiguous)).toHaveLength(values.length);
  });

  it('represents an empty window with the full body spacer and handles zero rows or zero sizes', () => {
    const values = rows([1, 2, 3]);
    const virtual = native(values, [10, 20, 30]);
    virtual.getVirtualItems();
    expect(virtualTableEntries(values, [], virtual.getTotalSize(), 20)).toEqual([
      { kind: 'spacer', key: 'virtual:gap:-1:end', height: 60 },
    ]);
    const empty = native([], []);
    expect(virtualTableEntries([], empty.getVirtualItems(), empty.getTotalSize(), 73)).toEqual([]);
    const zero = native(values, [0, 0, 0]);
    zero.getVirtualItems();
    const entries = virtualTableEntries(values, zero.measurementsCache, zero.getTotalSize(), 0);
    expect(spacers(entries)).toEqual([]);
    expect(rendered(entries).map((entry) => entry.index)).toEqual([0, 1, 2]);
    expect(geometry(entries, zero.measurementsCache)).toBe(0);
  });

  it('follows current native indexes after reorder while retaining typed row keys and original references', () => {
    const initial = rows([0, '0', 'other']);
    const virtual = native(initial, [20, 20, 20]);
    virtual.getVirtualItems();
    const stale = [...virtual.measurementsCache];
    const current = [initial[2]!, initial[0]!, initial[1]!];
    virtual.setOptions({ ...virtual.options, getItemKey: (index) => current[index]!.id });
    virtual.getVirtualItems();
    const items = virtual.measurementsCache;
    const entries = virtualTableEntries(current, items, virtual.getTotalSize(), 0);
    expect(rendered(entries).map((entry) => [entry.key, entry.index])).toEqual([
      ['string:other', 0],
      ['number:0', 1],
      ['string:0', 2],
    ]);
    expect(rendered(entries).map((entry) => entry.row)).toEqual(current);
    expect(rendered(virtualTableEntries(current, stale, virtual.getTotalSize(), 0))).toEqual([]);
  });

  it('sorts native ranges, ignores duplicates and rejects stale or out-of-bounds indexes', () => {
    const values = rows([0, '0', 2]);
    const virtual = native(values, [10, 20, 30]);
    virtual.getVirtualItems();
    const [first, second, last] = virtual.measurementsCache;
    const items = [
      last!,
      second!,
      first!,
      second!,
      { ...first!, index: -1 },
      { ...last!, index: values.length },
      { ...second!, index: 0.5 },
      { ...first!, key: 'string:0' },
    ];
    const entries = virtualTableEntries(values, items, virtual.getTotalSize(), 0);
    expect(rendered(entries).map((entry) => entry.key)).toEqual([
      'number:0',
      'string:0',
      'number:2',
    ]);
    expect(spacers(entries)).toEqual([]);
    expect(geometry(entries, virtual.measurementsCache)).toBe(60);
  });
});
