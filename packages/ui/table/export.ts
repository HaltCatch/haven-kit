import type { JsonObject, TableColumn, TableQuery, TableRowKey } from '@haven/schema';
import type { LocalColumn, LocalTable } from './features';
import { encodeHavenCsvCell } from './csv';
import type { HavenTableCsvOptions, HavenTableCsvResult } from './csv';
import type { HavenTableCellContext } from './cell-renderers';

export interface HavenTableExportContext {
  readonly mode: 'local' | 'remote';
  /** In a local scroll collection, native pageIndex/pageSize are retained but do not slice rows. */
  readonly pagination?: 'pages' | 'none';
  readonly query: Readonly<TableQuery>;
  readonly columns: readonly Readonly<TableColumn>[];
  readonly selection: readonly TableRowKey[];
  readonly total: number | null;
  readonly locale: string;
}
interface CsvSource {
  table: LocalTable;
  columns: readonly LocalColumn[];
  remote: boolean;
  unavailable: boolean;
  context(row: JsonObject, columnId: string): HavenTableCellContext;
}
/** Uses the native pre-pagination/final row models; never reimplements filtering or sorting. */
export function createTableCsv(
  source: CsvSource,
  options: HavenTableCsvOptions,
): HavenTableCsvResult {
  if (source.unavailable) return { status: 'error', code: 'unavailable' };
  if (
    source.remote ? options.scope !== 'loaded-page' : !['filtered', 'page'].includes(options.scope)
  )
    return { status: 'error', code: 'scope' };
  if (!source.columns.length) return { status: 'error', code: 'columns' };
  const rows =
    options.scope === 'filtered'
      ? source.table.getPreExpandedRowModel().flatRows
      : source.table.getRowModel().rows;
  if (rows.length > 100000 || rows.length * source.columns.length > 1000000)
    return { status: 'error', code: 'limit' };
  let columnId: string | undefined;
  try {
    const lines = [
      source.columns.map((column) => encodeHavenCsvCell(column.columnDef.header)).join(','),
    ];
    const columnIds = source.columns.map((column) => column.id);
    let characters = lines[0]!.length + 3;
    const withinLimit = () => characters * 3 <= 32 * 1024 * 1024;
    if (!withinLimit()) return { status: 'error', code: 'limit' };
    // Capture every value/context before calling trusted formatters. A callback may synchronously
    // update the host, but this export must retain one consistent row/column snapshot.
    const prepared: { id: string; text?: string; format?: () => unknown }[][] = [];
    for (const row of rows) {
      const cells = source.columns.map((column) => {
        columnId = column.id;
        const formatter = options.formatters?.get(column.id);
        if (formatter) {
          const context = source.context(row.original, column.id);
          return { id: column.id, format: () => formatter(context) };
        }
        const text = encodeHavenCsvCell(row.getValue(column.id), options.objectValues);
        characters += text.length;
        return { id: column.id, text };
      });
      characters += source.columns.length + 1;
      if (!withinLimit()) return { status: 'error', code: 'limit' };
      prepared.push(cells);
    }
    for (const cells of prepared) {
      const line = cells
        .map((cell) => {
          columnId = cell.id;
          if (!cell.format) return cell.text!;
          const text = encodeHavenCsvCell(cell.format(), options.objectValues);
          characters += text.length;
          return text;
        })
        .join(',');
      if (!withinLimit()) return { status: 'error', code: 'limit' };
      lines.push(line);
    }
    return {
      status: 'ready',
      csv: (options.bom === false ? '' : '\ufeff') + lines.join('\r\n') + '\r\n',
      scope: options.scope,
      rowCount: rows.length,
      columnIds,
      mimeType: 'text/csv;charset=utf-8',
    };
  } catch {
    return { status: 'error', code: 'value', ...(columnId ? { columnId } : {}) };
  }
}
