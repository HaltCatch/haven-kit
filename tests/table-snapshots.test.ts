import { describe, expect, it } from 'vitest';
import { TableCellSnapshotCache } from '../packages/ui/table/cell-snapshot-cache.mjs';

describe('custom table cell snapshots', () => {
  it('refreshes reused row and parameter objects when the host publishes a new input revision', () => {
    const snapshots = new TableCellSnapshotCache();
    const row = { id: 0, profile: { label: 'Before' } };
    const firstRows = [row];
    const first = snapshots.snapshot(row, firstRows);
    row.profile.label = 'After';
    const second = snapshots.snapshot(row, [row]);
    expect(second.profile.label).toBe('After');
    expect(first.profile.label).toBe('Before');
    expect(second).not.toBe(first);

    const params = { style: { emphasis: 'normal' } };
    const firstColumns = [{ rendererParams: params }];
    const before = snapshots.snapshot(params, firstColumns);
    params.style.emphasis = 'strong';
    expect(snapshots.snapshot(params, [...firstColumns]).style.emphasis).toBe('strong');
    expect(before.style.emphasis).toBe('normal');
  });

  it('shares one deep immutable copy within a revision and isolates table instances', () => {
    const snapshots = new TableCellSnapshotCache();
    const otherTable = new TableCellSnapshotCache();
    const row = { id: 0, profile: { tags: ['first'] } };
    const rows = [row];
    const first = snapshots.snapshot(row, rows);
    expect(snapshots.snapshot(row, rows)).toBe(first);
    expect(otherTable.snapshot(row, rows)).not.toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.profile)).toBe(true);
    expect(Object.isFrozen(first.profile.tags)).toBe(true);
    expect(() => first.profile.tags.push('second')).toThrow(TypeError);
    expect(Object.isFrozen(row.profile)).toBe(false);
    expect(row.profile.tags).toEqual(['first']);
  });
});
