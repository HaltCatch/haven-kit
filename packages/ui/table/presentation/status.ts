import type { HavenLocalization } from '@haven/ui';
import type { TableHierarchy } from '@haven/schema';
import type { LocalTable } from '../features';
import { tableHierarchyStatus } from '../hierarchy/status';

export function tablePresentationStatus(
  table: LocalTable,
  locale: HavenLocalization,
  collection: boolean,
  hierarchy: TableHierarchy | undefined,
  remote: boolean,
  status: string,
  total: number | null,
): string {
  if (collection)
    return locale.message('table.virtual.collection', {
      count: locale.number(table.getFilteredRowModel().flatRows.length),
      visible: locale.number(table.getRowModel().rows.length),
    });
  if (hierarchy) return tableHierarchyStatus(table, hierarchy, locale);
  if (remote && status !== 'ready')
    return locale.message(status === 'error' ? 'table.unavailable' : 'table.loading');
  const pagination = table.atoms.pagination.get();
  return locale.message('table.page', {
    page: locale.number(pagination.pageIndex + 1),
    pages: locale.number(Math.max(1, table.getPageCount())),
    count: locale.number(remote ? (total ?? 0) : table.getFilteredRowModel().flatRows.length),
  });
}
