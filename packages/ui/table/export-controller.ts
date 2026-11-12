import { inject, signal } from '@angular/core';
import { HavenLocalization } from '@haven/ui';
import { HAVEN_THEME_CONTEXT } from '@haven/ui/theme';
import { readPointer } from '@haven/schema';
import type { JsonValue, TableColumn, TableRowKey } from '@haven/schema';
import { HavenTableCellSnapshots } from './cell-snapshots';
import type { HavenTableCellContext, HavenTableCellValue } from './cell-renderers';
import type { LocalColumn, LocalTable } from './features';
import { createTableCsv } from './export';
import { downloadHavenTableCsv } from './csv-download';
import type { HavenTableExportContext } from './export';
import type { HavenTableCsvOptions, HavenTableCsvResult } from './csv';
interface Inputs {
  table(): LocalTable;
  columns(): readonly LocalColumn[];
  models(): ReadonlyMap<string, TableColumn>;
  rowKey(): string;
  remote(): boolean;
  pagination(): 'pages' | 'none';
  unavailable(): boolean;
  disabled(): boolean;
  readonly(): boolean;
  selection(): readonly TableRowKey[];
  total(): number | null;
}
/** Export snapshots are independent of the host; all query/row ordering stays in TanStack. */
export function injectTableExport(host: Inputs) {
  const snapshots = inject(HavenTableCellSnapshots);
  const localization = inject(HavenLocalization);
  const theme = inject(HAVEN_THEME_CONTEXT, { optional: true });
  const result = signal<HavenTableCsvResult | null>(null);
  const context = (): HavenTableExportContext => {
    const table = host.table();
    return snapshots.snapshot({
      mode: host.remote() ? ('remote' as const) : ('local' as const),
      pagination: host.pagination(),
      query: {
        ...table.atoms.pagination.get(),
        sort: table.atoms.sorting.get().map((sort) => ({
          columnId: sort.id,
          direction: sort.desc ? ('desc' as const) : ('asc' as const),
        })),
        filter: String(table.atoms.globalFilter.get() ?? ''),
        columnFilters: table.atoms.columnFilters.get().map(({ id, value }) => ({
          columnId: id,
          value: value as JsonValue,
        })),
      },
      columns: host.columns().map((column) => host.models().get(column.id)!),
      selection: [...host.selection()],
      total: host.total(),
      locale: localization.locale(),
    });
  };
  const create = (options: HavenTableCsvOptions): HavenTableCsvResult =>
    createTableCsv(
      {
        table: host.table(),
        columns: host.columns(),
        remote: host.remote(),
        unavailable: host.unavailable(),
        context: (original, columnId): HavenTableCellContext => {
          const row = snapshots.snapshot(original),
            column = host.models().get(columnId)!;
          const currentTheme = theme?.();
          return Object.freeze({
            rowKey: readPointer(row, host.rowKey()) as TableRowKey,
            row,
            columnId,
            value: readPointer(row, column.path) as HavenTableCellValue | undefined,
            params: snapshots.snapshot(column.rendererParams ?? {}),
            locale: localization.locale(),
            theme: currentTheme ? snapshots.snapshot(currentTheme) : null,
            disabled: host.disabled(),
            readonly: host.readonly(),
          });
        },
      },
      options,
    );
  return {
    context,
    create,
    result: result.asReadonly(),
    download(options: HavenTableCsvOptions, filename?: string): HavenTableCsvResult {
      const next = create(options);
      const completed: HavenTableCsvResult =
        next.status === 'ready' && !downloadHavenTableCsv(next, filename)
          ? { status: 'error', code: 'download' }
          : next;
      result.set(completed);
      return completed;
    },
  };
}
