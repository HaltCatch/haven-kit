import { computed, effect, signal } from '@angular/core';
import type { Signal } from '@angular/core';
import type { TableDataAdapter, TableDataSource, TableDataState } from '@haven/runtime';
import type { TableColumn, TableQuery } from '@haven/schema';
import { tableDataColumnsKey } from './remote-data';

interface Inputs {
  source: Signal<TableDataSource | undefined>;
  query: Signal<TableQuery>;
  state: Signal<TableDataState>;
  locale: Signal<string>;
  columns: Signal<readonly TableColumn[]>;
  reloadVersion: Signal<number>;
  reload(): void;
}
interface Refresh {
  identity: string;
  adapter: TableDataAdapter;
  query: string;
  locale: string;
  columns: string;
  reload: number;
}

/** Remote editing belongs to one loaded window; a confirmed write and its read refresh differ. */
export function createRemoteTableEditState(inputs: Inputs) {
  const scope = computed(
    () => {
      const source = inputs.source();
      return source
        ? {
            identity: source.identity,
            adapter: source.adapter,
            query: JSON.stringify(inputs.query()),
            locale: inputs.locale(),
            window: inputs.state(),
          }
        : undefined;
    },
    {
      equal: (a, b) =>
        a?.identity === b?.identity &&
        a?.adapter === b?.adapter &&
        a?.query === b?.query &&
        a?.locale === b?.locale &&
        a?.window === b?.window,
    },
  );
  const refresh = signal<Refresh | undefined>(undefined);
  const matches = (expected: Refresh) => {
    const source = inputs.source();
    return (
      source?.identity === expected.identity &&
      source.adapter === expected.adapter &&
      JSON.stringify(inputs.query()) === expected.query &&
      inputs.locale() === expected.locale &&
      tableDataColumnsKey(inputs.columns()) === expected.columns
    );
  };
  const refreshFailed = computed(() => {
    const expected = refresh();
    return (
      !!expected &&
      matches(expected) &&
      inputs.reloadVersion() === expected.reload &&
      inputs.state().status === 'error'
    );
  });
  effect(() => {
    const expected = refresh();
    if (
      expected &&
      matches(expected) &&
      inputs.reloadVersion() === expected.reload &&
      inputs.state().status === 'ready'
    )
      refresh.set(undefined);
  });
  const reload = () => {
    const expected = refresh();
    const preserve = expected && matches(expected);
    inputs.reload();
    if (preserve) refresh.set({ ...expected, reload: inputs.reloadVersion() });
  };
  const committed = () => {
    const source = inputs.source();
    if (!source) return;
    inputs.reload();
    refresh.set({
      identity: source.identity,
      adapter: source.adapter,
      query: JSON.stringify(inputs.query()),
      locale: inputs.locale(),
      columns: tableDataColumnsKey(inputs.columns()),
      reload: inputs.reloadVersion(),
    });
  };
  return {
    scope,
    refreshFailed,
    committed,
    reload,
    available: () => !inputs.source() || inputs.state().status === 'ready',
  };
}
