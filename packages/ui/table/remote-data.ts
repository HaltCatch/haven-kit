import { DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import type { Signal, WritableSignal } from '@angular/core';
import { TableDataLoader, initialTableDataState } from '@haven/runtime';
import type { TableDataSource, TableDataState } from '@haven/runtime';
import type { TableColumn, TableQuery } from '@haven/schema';

interface Inputs {
  source: Signal<TableDataSource | undefined>;
  query: WritableSignal<TableQuery>;
  columns: Signal<readonly TableColumn[]>;
  rowKey: Signal<string>;
  locale: Signal<string>;
  resetIdentity(): void;
}
/** Resource ownership and cancellation, separate from the single native TanStack state owner. */
export function injectRemoteTableData(inputs: Inputs) {
  // Labels, tooltips and renderer/editor presentation do not change the remote read contract.
  const requestColumns = computed(inputs.columns, {
    equal: (a, b) => tableDataColumnsKey(a) === tableDataColumnsKey(b),
  });
  const state = signal(initialTableDataState()),
    reload = signal(0);
  const loader = new TableDataLoader((value) => state.set(value));
  const identity = computed(() => inputs.source()?.identity),
    adapter = computed(() => inputs.source()?.adapter);
  const capabilities = computed(() => inputs.source()?.adapter.supportedColumnFilters);
  type Owner = {
    identity: string | undefined;
    adapter: ReturnType<typeof adapter>;
    rowKey: string;
  };
  let previous: Owner | undefined;
  const active = signal<{
    owner: Owner;
    query: TableQuery;
    columns: readonly TableColumn[];
    locale: string;
    capabilities: ReturnType<typeof capabilities>;
    reload: number;
  } | null>(null);
  effect(() => {
    const owner = { identity: identity(), adapter: adapter(), rowKey: inputs.rowKey() };
    const columns = requestColumns(),
      locale = inputs.locale();
    const reloadVersion = reload();
    if (
      previous &&
      (previous.identity !== owner.identity ||
        previous.adapter !== owner.adapter ||
        previous.rowKey !== owner.rowKey)
    )
      untracked(() => inputs.resetIdentity());
    previous = owner;
    const query = inputs.query();
    active.set({
      owner,
      query,
      columns,
      locale,
      capabilities: capabilities(),
      reload: reloadVersion,
    });
    if (!owner.adapter) {
      loader.cancel();
      return;
    }
    void loader.load(owner.adapter, query, columns, owner.rowKey, locale);
  });
  inject(DestroyRef).onDestroy(() => loader.dispose());
  const current = computed(() => {
    const request = active();
    return (
      !!request &&
      request.owner.identity === identity() &&
      request.owner.adapter === adapter() &&
      request.owner.rowKey === inputs.rowKey() &&
      request.columns === requestColumns() &&
      request.locale === inputs.locale() &&
      request.capabilities === capabilities() &&
      request.reload === reload() &&
      request.query === inputs.query()
    );
  });
  const data = computed<TableDataState>(() =>
    current()
      ? state()
      : {
          ...initialTableDataState(),
          status: adapter() ? 'loading' : 'idle',
        },
  );
  // A shrinking total may invalidate a requested page. Strictly decrease its index; never retry the same page in a loop.
  effect(() => {
    const result = data();
    if (result.status !== 'ready' || result.total === null || !result.query) return;
    const last = Math.max(0, Math.ceil(result.total / result.query.pageSize) - 1);
    if (result.query.pageIndex > last)
      untracked(() => inputs.query.update((query) => ({ ...query, pageIndex: last })));
  });
  return {
    state: data,
    reloadVersion: reload.asReadonly(),
    reload: () => reload.update((value) => value + 1),
  };
}

export function tableDataColumnsKey(columns: readonly TableColumn[]): string {
  return JSON.stringify(
    columns.map((column) => [
      column.id,
      column.path,
      column.type,
      column.sortable,
      column.filter,
      !!column.renderer,
    ]),
  );
}

/** Core and Angular both merge options. Use the native final merge hook to release a remote-only override. */
export const mergeTableOptions: NonNullable<
  import('./features').LocalTable['options']['mergeOptions']
> = (current, update) => {
  const next = { ...current, ...update };
  if (!next.manualPagination) delete next.rowCount;
  return next;
};
