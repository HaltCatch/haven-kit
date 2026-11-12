import { compareTableValues, readPointer } from '@haven/schema';
import type { JsonObject, JsonPrimitive, TableColumn, TableHeaderLayout } from '@haven/schema';
import type { ColumnDef } from '@tanstack/angular-table';
import type { features } from '../features';

export type HavenColumnDefinition = ColumnDef<typeof features, JsonObject>;

/** Leaf access and extension contracts stay independent of the optional header hierarchy. */
export function tableLeafDefinitions(
  columns: readonly TableColumn[],
  text: (value: unknown) => string,
  collator: Intl.Collator,
  filter: (column: TableColumn) => Partial<HavenColumnDefinition>,
): HavenColumnDefinition[] {
  return columns.map((column) => ({
    id: column.id,
    ...filter(column),
    header: text(column.header),
    accessorFn: (row) => readPointer(row, column.path) ?? undefined,
    enableSorting: column.sortable ?? (!column.renderer || !!column.type),
    sortDescFirst: false,
    sortUndefined: 'last',
    sortFn: (a, b, id) =>
      compareTableValues(a.getValue<JsonPrimitive>(id), b.getValue<JsonPrimitive>(id), collator),
  }));
}

/** A reserved namespace prevents group IDs from colliding with public data-column IDs. */
export function tableHeaderDefinitions(
  layout: TableHeaderLayout | undefined,
  leaves: readonly HavenColumnDefinition[],
  text: (value: unknown) => string,
): HavenColumnDefinition[] {
  if (layout === undefined) return [...leaves];
  const columns = new Map(leaves.map((column) => [column.id!, column]));
  const visit = (items: TableHeaderLayout): HavenColumnDefinition[] =>
    items.map((item) =>
      typeof item === 'string'
        ? columns.get(item)!
        : {
            id: `group:${item.id}`,
            header: text(item.header),
            columns: visit(item.children),
            enableSorting: false,
            enableColumnFilter: false,
            enableGlobalFilter: false,
          },
    );
  return visit(layout);
}
