import {
  tableColumnFilterDefinitions,
  snapshotTableFilters,
  tableFilterCapabilitiesKey,
} from './table-filter-capabilities.js';
import type {
  TableColumnFilterSupport,
  TableColumnFilterDefinition,
} from './table-filter-capabilities.js';
import { isTableQuery, validateTableData } from '@haven/schema';
import type { JsonObject, TableColumn, TableQuery } from '@haven/schema';
import { LatestRequest } from './adapters.js';
import { copyTablePage, InvalidTableResponse } from './table-response.js';

export interface TableDataRequest extends TableQuery {
  readonly columnFilterDefinitions?: readonly TableColumnFilterDefinition[];
  readonly locale: string;
  readonly signal: AbortSignal;
}
export interface TableDataPage {
  readonly rows: readonly JsonObject[];
  readonly total: number;
}
export interface TableDataAdapter {
  readonly supportedColumnFilters?: readonly TableColumnFilterSupport[];
  load(request: TableDataRequest): Promise<TableDataPage>;
}
/** Trusted runtime registration; neither functions nor URLs belong in a persisted UI model. */
export interface TableDataSource {
  readonly identity: string;
  readonly adapter: TableDataAdapter;
}
export interface TableDataState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly query: TableQuery | null;
  readonly rows: readonly JsonObject[];
  readonly total: number | null;
  readonly error: 'query' | 'response' | 'adapter' | null;
}
const empty = Object.freeze([]);
export const initialTableDataState = (): TableDataState =>
  Object.freeze({
    status: 'idle',
    query: null,
    rows: empty,
    total: null,
    error: null,
  });
/** Fetch ownership only. TanStack owns pagination/sorting/filtering; this never transforms rows. */
export class TableDataLoader {
  readonly #latest = new LatestRequest<TableDataPage>();
  #generation = 0;
  #disposed = false;
  constructor(private readonly changed: (state: TableDataState) => void) {}
  async load(
    adapter: TableDataAdapter,
    query: TableQuery,
    columns: readonly TableColumn[],
    rowKey: string,
    locale: string,
  ): Promise<void> {
    if (this.#disposed) return;
    const generation = ++this.#generation;
    this.#latest.dispose();
    if (!isTableQuery(query, columns) || validateTableData([], columns, rowKey)) {
      this.changed(
        Object.freeze({ status: 'error', query: null, rows: empty, total: null, error: 'query' }),
      );
      return;
    }
    const definitions = tableColumnFilterDefinitions(
      query,
      columns,
      adapter.supportedColumnFilters,
    );
    const capabilities = tableFilterCapabilitiesKey(adapter.supportedColumnFilters);
    if (!definitions || capabilities === null) {
      this.changed(
        Object.freeze({ status: 'error', query: null, rows: empty, total: null, error: 'query' }),
      );
      return;
    }
    const snapshot: TableQuery = snapshotTableFilters({
      ...query,
      sort: Object.freeze(query.sort.map((sort) => Object.freeze({ ...sort }))),
    });
    const state = (patch: Partial<TableDataState>): TableDataState =>
      Object.freeze({
        status: 'loading',
        query: snapshot,
        rows: empty,
        total: null,
        error: null,
        ...patch,
      });
    this.changed(state({}));
    try {
      const result = await this.#latest.run(async (signal) =>
        copyTablePage(
          await adapter.load(
            Object.freeze({
              ...snapshot,
              ...(definitions.length
                ? { columnFilterDefinitions: snapshotTableFilters(definitions) }
                : {}),
              locale,
              signal,
            }),
          ),
          snapshot,
          columns,
          rowKey,
        ),
      );
      if (!result.current || this.#disposed || generation !== this.#generation) return;
      if (tableFilterCapabilitiesKey(adapter.supportedColumnFilters) !== capabilities) {
        this.changed(state({ status: 'error', rows: empty, total: null, error: 'query' }));
        return;
      }
      this.changed(state({ status: 'ready', rows: result.value.rows, total: result.value.total }));
    } catch (error) {
      if (this.#disposed || generation !== this.#generation) return;
      this.changed(
        state({
          status: 'error',
          error: error instanceof InvalidTableResponse ? 'response' : 'adapter',
        }),
      );
    }
  }
  cancel(): void {
    this.#generation++;
    this.#latest.dispose();
    if (!this.#disposed) this.changed(initialTableDataState());
  }
  dispose(): void {
    this.#disposed = true;
    this.#generation++;
    this.#latest.dispose();
  }
}
