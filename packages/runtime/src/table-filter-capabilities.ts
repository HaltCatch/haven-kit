import type { JsonObject, TableColumn, TableQuery } from '@haven/schema';
import { isTableRendererId, isTableRendererParams } from '@haven/schema';
export interface TableColumnFilterSupport {
  readonly columnId: string;
  readonly filterId: string;
}
export interface TableColumnFilterDefinition extends TableColumnFilterSupport {
  readonly params: Readonly<JsonObject>;
}
/** Exact trusted server capability declaration. Missing/ambiguous support never means filtering works. */
export function supportsTableColumnFilter(
  support: readonly TableColumnFilterSupport[] | undefined,
  column: TableColumn,
): boolean {
  if (!support || !column.filter || tableFilterCapabilitiesKey(support) === null) return false;
  return support.some(
    (entry) => entry.columnId === column.id && entry.filterId === column.filter!.id,
  );
}
/** Internal canonical capability key; reject malformed declarations before any adapter side effect. */
export function tableFilterCapabilitiesKey(
  support: readonly TableColumnFilterSupport[] | undefined,
): string | null {
  if (support === undefined) return '[]';
  if (!Array.isArray(support) || support.length > 100 || !isTableRendererParams({ support }))
    return null;
  const seen = new Set<string>();
  for (const entry of support) {
    if (
      !entry ||
      Object.keys(entry).length !== 2 ||
      !isTableRendererId(entry.columnId) ||
      !isTableRendererId(entry.filterId) ||
      seen.has(entry.columnId)
    )
      return null;
    seen.add(entry.columnId);
  }
  return JSON.stringify(support);
}
export function tableColumnFilterDefinitions(
  query: TableQuery,
  columns: readonly TableColumn[],
  support: readonly TableColumnFilterSupport[] | undefined,
): readonly TableColumnFilterDefinition[] | null {
  const result: TableColumnFilterDefinition[] = [];
  for (const condition of query.columnFilters ?? []) {
    const column = columns.find((column) => column.id === condition.columnId);
    if (!column?.filter || !supportsTableColumnFilter(support, column)) return null;
    result.push({
      columnId: column.id,
      filterId: column.filter.id,
      params: column.filter.params ?? {},
    });
  }
  return result;
}
/** Query/definition JSON was bounded and validated before crossing this snapshot boundary. */
export function snapshotTableFilters<T>(value: T): T {
  const result = structuredClone(value);
  const freeze = (entry: unknown): void => {
    if (!entry || typeof entry !== 'object' || Object.isFrozen(entry)) return;
    Object.values(entry).forEach(freeze);
    Object.freeze(entry);
  };
  freeze(result);
  return result;
}
