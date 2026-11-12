import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { provideHavenTransloco } from '@haven/ui/i18n';
import english from '@haven/ui/i18n/locales/en-US.json';
import type { TableColumn, TableQuery } from '@haven/schema';
import type { TableDataAdapter, TableDataPage, TableDataRequest } from '@haven/runtime';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { HavenTable } from '../table';
import type { HavenTableCellContext } from '../cell-renderers';
const columns: TableColumn[] = [{ id: 'label', path: '/label', header: 'Label', type: 'text' }];
const query: TableQuery = { pageIndex: 0, pageSize: 2, sort: [], filter: '' };
const pages = [
  {
    rows: [
      { id: 0, label: 'Zulu' },
      { id: '0', label: 'Alpha' },
    ],
    total: 4,
  },
  {
    rows: [
      { id: 2, label: 'Two' },
      { id: 3, label: 'Three' },
    ],
    total: 4,
  },
];
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (value: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [
      provideTransloco({
        config: { defaultLang: 'en-US', availableLangs: ['en-US', 'zh-CN'], prodMode: true },
      }),
      provideHavenTransloco(),
    ],
  });
  const locale = TestBed.inject(TranslocoService);
  locale.setTranslation({ haven: english }, 'en-US');
  locale.setTranslation({ haven: english }, 'zh-CN');
});
afterEach(() => TestBed.resetTestingModule());
async function create(
  adapter: TableDataAdapter,
  initial = query,
  extra: Record<string, unknown> = {},
  settle = true,
) {
  const fixture = TestBed.createComponent(HavenTable);
  for (const [name, value] of Object.entries({
    columns,
    query: initial,
    source: { identity: 'page:table', adapter },
    filterable: true,
    selectable: true,
    ...extra,
  }))
    fixture.componentRef.setInput(name, value);
  await fixture.whenStable();
  if (settle) await ready(fixture);
  return fixture;
}
async function ready(fixture: Awaited<ReturnType<typeof create>>) {
  await expect.poll(() => fixture.componentInstance.dataState().status).toBe('ready');
  await fixture.whenStable();
}
it('uses native manual row models and controlled query changes without sorting/filtering/paging server rows again', async () => {
  const calls: TableDataRequest[] = [];
  const fixture = await create(
    {
      load: async (request) => {
        calls.push(request);
        return pages[request.pageIndex]!;
      },
    },
    { ...query, sort: [{ columnId: 'label', direction: 'asc' }], filter: 'server-search' },
  );
  const component = fixture.componentInstance;
  expect(component.table.getRowModel().rows.map((row) => row.original['label'])).toEqual([
    'Zulu',
    'Alpha',
  ]);
  expect(component.table.options.manualFiltering).toBe(true);
  expect(component.table.options.manualSorting).toBe(true);
  expect(component.table.options.manualPagination).toBe(true);
  component.table.nextPage();
  await fixture.whenStable();
  await ready(fixture);
  expect(component.query().pageIndex).toBe(1);
  expect(component.table.getRowModel().rows.map((row) => row.original['id'])).toEqual([2, 3]);
  component.sort(component.table.getColumn('label')!);
  await fixture.whenStable();
  await ready(fixture);
  expect(component.query()).toMatchObject({
    pageIndex: 0,
    sort: [{ columnId: 'label', direction: 'desc' }],
  });
  component.table.setGlobalFilter('next-search');
  await fixture.whenStable();
  await ready(fixture);
  expect(calls.at(-1)?.filter).toBe('next-search');
  expect(component.query().pageIndex).toBe(0);
  component.table.setPageSize(1);
  await fixture.whenStable();
  expect(component.query().pageSize).toBe(1);
  // The intentionally fixed-size fixture is rejected after changing the requested window size.
  await expect.poll(() => component.dataState().error).toBe('response');
});
it('preserves typed off-page selection and limits select-all/deselect-all to the loaded page', async () => {
  const fixture = await create({ load: async (request) => pages[request.pageIndex]! });
  const component = fixture.componentInstance;
  component.selectAll(true);
  await fixture.whenStable();
  expect(component.selection()).toEqual([0, '0']);
  component.table.nextPage();
  await fixture.whenStable();
  await ready(fixture);
  expect(component.selection()).toEqual([0, '0']);
  expect(component.issue()).toBeNull();
  component.selectAll(true);
  await fixture.whenStable();
  expect(component.selection()).toEqual([0, '0', 2, 3]);
  component.selectAll(false);
  await fixture.whenStable();
  expect(component.selection()).toEqual([0, '0']);
  component.table.setGlobalFilter('different');
  await fixture.whenStable();
  await ready(fixture);
  expect(component.selection()).toEqual([0, '0']);
  fixture.componentRef.setInput('selection', [0, '0', 999]);
  await fixture.whenStable();
  expect(component.issue()).toBeNull();
  fixture.componentRef.setInput('selection', [null]);
  await fixture.whenStable();
  expect(component.issue()?.code).toBe('selection');
});
it('ignores stale success/error, clears old rows while loading, and retries only the latest query', async () => {
  const calls: { request: TableDataRequest; work: ReturnType<typeof deferred<TableDataPage>> }[] =
    [];
  const fixture = await create(
    {
      load: (request) => {
        const work = deferred<TableDataPage>();
        calls.push({ request, work });
        return work.promise;
      },
    },
    query,
    {},
    false,
  );
  const component = fixture.componentInstance;
  expect(component.dataState().status).toBe('loading');
  component.table.setGlobalFilter('new');
  await fixture.whenStable();
  expect(calls[0]!.request.signal.aborted).toBe(true);
  calls[1]!.work.resolve(pages[0]!);
  await fixture.whenStable();
  await expect.poll(() => component.dataState().status).toBe('ready');
  calls[0]!.work.reject(new Error('stale'));
  await fixture.whenStable();
  expect(component.dataState().error).toBeNull();
  component.table.nextPage();
  await fixture.whenStable();
  expect(component.displayedRows()).toEqual([]);
  expect(component.selectionDisabled()).toBe(true);
  calls[2]!.work.reject(new Error('network'));
  await fixture.whenStable();
  await expect.poll(() => component.dataState().error).toBe('adapter');
  component.reload();
  await fixture.whenStable();
  expect(calls[3]!.request).toMatchObject({ pageIndex: 1, filter: 'new' });
  calls[3]!.work.resolve(pages[1]!);
  await fixture.whenStable();
  await expect.poll(() => component.dataState().status).toBe('ready');
});
it('strictly decreases an invalid page when totals shrink, then stops without a request loop', async () => {
  let total = 3;
  const calls: number[] = [];
  const fixture = await create(
    {
      load: async (request) => {
        calls.push(request.pageIndex);
        return {
          rows: request.pageIndex === 1 && total === 3 ? [{ id: 2, label: 'Last' }] : [],
          total,
        };
      },
    },
    { ...query, pageIndex: 7 },
  );
  const component = fixture.componentInstance;
  await expect.poll(() => component.query().pageIndex).toBe(1);
  await fixture.whenStable();
  expect(calls).toEqual([7, 1]);
  expect(component.dataState().total).toBe(3);
  total = 0;
  component.reload();
  await fixture.whenStable();
  await expect.poll(() => component.query().pageIndex).toBe(0);
  await fixture.whenStable();
  expect(calls).toEqual([7, 1, 1, 0]);
  expect(component.dataState()).toMatchObject({ status: 'ready', total: 0, rows: [] });
});
it('separates readonly selection from browsing, blocks disabled interactions and cancels on owner/locale/destroy', async () => {
  const calls: TableDataRequest[] = [];
  const adapter = {
    load: async (request: TableDataRequest) => {
      calls.push(request);
      return pages[request.pageIndex]!;
    },
  };
  const fixture = await create(adapter, query, { readonly: true });
  const component = fixture.componentInstance;
  component.selectAll(true);
  component.table.getRowModel().rows[0]!.toggleSelected(true);
  expect(component.selection()).toEqual([]);
  component.table.nextPage();
  await fixture.whenStable();
  await ready(fixture);
  expect(component.query().pageIndex).toBe(1);
  fixture.componentRef.setInput('disabled', true);
  await fixture.whenStable();
  component.table.previousPage();
  component.table.setGlobalFilter('blocked');
  component.reload();
  await fixture.whenStable();
  expect(component.query()).toMatchObject({ pageIndex: 1, filter: '' });
  expect(calls).toHaveLength(2);
  fixture.componentRef.setInput('disabled', false);
  fixture.componentRef.setInput('selection', [0]);
  fixture.componentRef.setInput('source', { identity: 'other-page:table', adapter });
  await fixture.whenStable();
  expect(component.query().pageIndex).toBe(0);
  expect(component.selection()).toEqual([]);
  TestBed.inject(TranslocoService).setActiveLang('zh-CN');
  await fixture.whenStable();
  expect(calls.at(-1)?.locale).toBe('zh-CN');
  const work = deferred<TableDataPage>();
  let signal!: AbortSignal;
  fixture.componentRef.setInput('source', {
    identity: 'waiting',
    adapter: {
      load: (request: TableDataRequest) => {
        signal = request.signal;
        return work.promise;
      },
    },
  });
  await fixture.whenStable();
  fixture.destroy();
  expect(signal.aborted).toBe(true);
  work.resolve(pages[0]!);
});
@Component({
  selector: 'haven-remote-cell-test',
  template: `{{ context().rowKey }}:{{ context().value }}:{{ context().readonly }}`,
  standalone: true,
})
class RemoteCell {
  readonly context = input.required<HavenTableCellContext>();
}
it('keeps registered custom cells and readonly context in remote mode, and restores local rows when removed', async () => {
  const fixture = await create({ load: async (request) => pages[request.pageIndex]! }, query, {
    readonly: true,
    columns: [{ ...columns[0], renderer: 'host.label' }],
    cellRenderers: new Map([['host.label', RemoteCell]]),
    rows: [{ id: 'local', label: 'Local' }],
  });
  const component = fixture.componentInstance;
  expect(
    (fixture.nativeElement as HTMLElement).querySelector('haven-remote-cell-test')?.textContent,
  ).toBe('0:Zulu:true');
  component.table.nextPage();
  await fixture.whenStable();
  await ready(fixture);
  expect(
    (fixture.nativeElement as HTMLElement).querySelector('haven-remote-cell-test')?.textContent,
  ).toBe('2:Two:true');
  fixture.componentRef.setInput('source', undefined);
  await fixture.whenStable();
  expect(component.table.getRowModel().rows.map((row) => row.original['id'])).toEqual(['local']);
  expect(component.table.options.manualPagination).toBe(false);
});

it('diagnoses malformed controlled queries without dispatch and resets typed selection when rowKey changes', async () => {
  let calls = 0;
  const adapter: TableDataAdapter = {
    load: async () => {
      calls++;
      return {
        rows: [
          { id: 0, alternate: 'a', label: 'A' },
          { id: '0', alternate: 'b', label: 'B' },
        ],
        total: 2,
      };
    },
  };
  const fixture = await create(adapter, query, { query: null }, false),
    component = fixture.componentInstance;
  expect(component.issue()?.code).toBe('query');
  expect(component.dataState().error).toBe('query');
  expect(calls).toBe(0);
  fixture.componentRef.setInput('query', query);
  await fixture.whenStable();
  await ready(fixture);
  component.selectAll(true);
  await fixture.whenStable();
  expect(component.selection()).toEqual([0, '0']);
  fixture.componentRef.setInput('rowKey', '/alternate');
  await fixture.whenStable();
  await ready(fixture);
  expect(component.selection()).toEqual([]);
  expect(component.table.getRowModel().rows.map((row) => row.id)).toEqual(['string:a', 'string:b']);
  expect(calls).toBe(2);
});

it('restores native local counts, page navigation and filtering after a differently sized remote dataset', async () => {
  const localRows = Array.from({ length: 25 }, (_, id) => ({
    id: `local-${id}`,
    label: `Local ${id}`,
  }));
  const adapter: TableDataAdapter = {
    load: async () => ({
      rows: [
        { id: 'r1', label: 'Remote 1' },
        { id: 'r2', label: 'Remote 2' },
      ],
      total: 5,
    }),
  };
  const fixture = await create(adapter, query, { rows: localRows, pageSize: 10 });
  const component = fixture.componentInstance;
  expect(component.table.getRowCount()).toBe(5);
  expect(component.table.getPageCount()).toBe(3);
  fixture.componentRef.setInput('source', undefined);
  await fixture.whenStable();
  expect(component.table.options.rowCount).toBeUndefined();
  expect(component.table.getRowCount()).toBe(25);
  expect(component.table.getPageCount()).toBe(3);
  expect(component.table.getCanNextPage()).toBe(true);
  const next = () =>
    [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('nav button'),
    ].find((button) => button.textContent?.trim() === english['table.next'])!;
  expect(next().disabled).toBe(false);
  next().click();
  await fixture.whenStable();
  expect(component.table.getRowModel().rows[0]!.original['label']).toBe('Local 10');
  component.table.setGlobalFilter('Local 2');
  await fixture.whenStable();
  expect(component.table.getRowCount()).toBe(6);
  expect(component.table.getPageCount()).toBe(1);
  expect(next().disabled).toBe(true);
  fixture.componentRef.setInput('source', { identity: 'remote-again', adapter });
  await fixture.whenStable();
  await ready(fixture);
  expect(component.table.getRowCount()).toBe(5);
  expect(component.table.getPageCount()).toBe(3);
  fixture.componentRef.setInput('source', undefined);
  await fixture.whenStable();
  expect(component.table.options.rowCount).toBeUndefined();
  expect(component.table.getRowCount()).toBe(6);
  component.table.setGlobalFilter('');
  await fixture.whenStable();
  expect(component.table.getRowCount()).toBe(25);
  expect(component.table.getCanNextPage()).toBe(true);
});
