import type { Header } from '@tanstack/angular-table';
import type { JsonObject } from '@haven/schema';
import type { LocalTable, features } from '../features';

export type HavenHeader = Header<typeof features, JsonObject>;
export interface HavenHeaderCell {
  readonly header: HavenHeader;
  readonly side: 'start' | 'center' | 'end';
  readonly offset: number;
}
export interface HavenHeaderRow {
  readonly depth: number;
  readonly cells: readonly HavenHeaderCell[];
}

/** Native regions split mixed-pin groups correctly; a group column's own pin flag does not. */
export function tableHeaderRows(table: LocalTable): HavenHeaderRow[] {
  const regions = [
    { side: 'start' as const, groups: table.getStartHeaderGroups() },
    { side: 'center' as const, groups: table.getCenterHeaderGroups() },
    { side: 'end' as const, groups: table.getEndHeaderGroups() },
  ];
  const depth = Math.max(0, ...regions.map((region) => region.groups.length));
  const endSize = table.getEndTotalSize();
  return Array.from({ length: depth }, (_, at) => ({
    depth: at,
    cells: regions.flatMap(({ side, groups }) =>
      (groups[at]?.headers ?? [])
        .filter((header) => header.rowSpan > 0 && header.colSpan > 0)
        .map((header) => ({
          header,
          side,
          offset:
            side === 'end' ? endSize - header.getStart() - header.getSize() : header.getStart(),
        })),
    ),
  }));
}
