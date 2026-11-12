import type { HavenLocalization } from '@haven/ui';
import type { TableHierarchy } from '@haven/schema';
import type { LocalTable } from '../features';

/** Pagination unit and complete record count are distinct for hierarchical row models. */
export function tableHierarchyStatus(
  table: LocalTable,
  hierarchy: TableHierarchy,
  locale: HavenLocalization,
): string {
  const pagination = table.atoms.pagination.get();
  return locale.message(
    hierarchy.pagination === 'visible-rows'
      ? 'table.hierarchy.pageVisible'
      : 'table.hierarchy.pageRoots',
    {
      page: locale.number(pagination.pageIndex + 1),
      pages: locale.number(Math.max(1, table.getPageCount())),
      roots: locale.number(table.getFilteredRowModel().rows.length),
      visible: locale.number(table.getPrePaginatedRowModel().rows.length),
      count: locale.number(table.getFilteredRowModel().flatRows.length),
    },
  );
}
