import type { VirtualItem } from '@tanstack/angular-virtual';
import type { HavenTableBodyEntry, HavenVirtualTableRow } from './types';

/** Native offsets supply all gaps, including those around a far-away retained editor or focus row. */
export function virtualTableEntries(
  rows: readonly HavenVirtualTableRow[],
  items: readonly VirtualItem[],
  total: number,
  margin: number,
): HavenTableBodyEntry[] {
  const result: HavenTableBodyEntry[] = [];
  let cursor = 0,
    previous = -1;
  for (const item of [...items].sort((left, right) => left.index - right.index)) {
    const row = rows[item.index];
    if (!row || row.id !== item.key || item.index === previous) continue;
    const start = Math.max(cursor, item.start - margin),
      gap = start - cursor;
    if (gap > 0)
      result.push({ kind: 'spacer', key: `virtual:gap:${previous}:${item.index}`, height: gap });
    result.push({ kind: 'row', key: row.id, row, index: item.index });
    cursor = Math.max(start, item.end - margin);
    previous = item.index;
  }
  if (total > cursor)
    result.push({ kind: 'spacer', key: `virtual:gap:${previous}:end`, height: total - cursor });
  return result;
}
