import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FormField } from '@angular/forms/signals';
import type { Field } from '@angular/forms/signals';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { provideHavenTransloco } from '@haven/ui/i18n';
import english from '@haven/ui/i18n/locales/en-US.json';
import { HavenTextField } from '@haven/ui/form';
import type { TableColumn, TableQuery } from '@haven/schema';
import type { TableDataRequest, TableDataPage } from '@haven/runtime';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { HavenTable } from '../table';
import { HavenTableFilterCard } from '../filter-card';
import { HavenTableFilterPanel } from '../filter-panel';
import { createHavenTableFilters } from '../filters';
import type { HavenTableFilterContext, HavenTableFilterRegistration } from '../filters';
const columns: TableColumn[] = [
  { id: 'label', path: '/label', header: 'Label', filter: { id: 'text' } },
  {
    id: 'amount',
    path: '/amount',
    header: 'Amount',
    type: 'number',
    filter: { id: 'number-range' },
  },
  { id: 'active', path: '/active', header: 'Active', type: 'boolean', filter: { id: 'boolean' } },
  { id: 'date', path: '/date', header: 'Date', filter: { id: 'date-range' } },
  {
    id: 'choice',
    path: '/choice',
    header: 'Choice',
    filter: {
      id: 'select',
      params: {
        options: [
          { label: 'Number', value: 0 },
          { label: 'Text', value: '0' },
        ],
      },
    },
  },
  { id: 'note', path: '/note', header: 'Note', filter: { id: 'empty' } },
];
const rows = [
  { id: 0, label: 'Alpha', amount: 0, active: false, date: '2024-02-29', choice: 0, note: null },
  {
    id: '0',
    label: 'alpha Two',
    amount: 2,
    active: true,
    date: '2024-03-01',
    choice: '0',
    note: '  ',
  },
  { id: 2, label: 'Beta', amount: 4, active: false, date: '2025-01-01', choice: 0, note: 'filled' },
];
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
async function create(extra: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(HavenTable);
  for (const [key, value] of Object.entries({
    columns,
    rows,
    pageSize: 1,
    selectable: true,
    filterable: true,
    ...extra,
  }))
    fixture.componentRef.setInput(key, value);
  await fixture.whenStable();
  return fixture;
}
const ids = (component: HavenTable) =>
  component.table.getFilteredRowModel().rows.map((row) => row.original['id']);
it('uses native intersection, case-insensitive text, typed false/zero, inclusive ranges and empty values', async () => {
  const fixture = await create(),
    table = fixture.componentInstance;
  for (const [id, value, expected] of [
    ['label', 'ALPHA', [0, '0']],
    ['amount', { min: 0, max: 2 }, [0, '0']],
    ['active', false, [0, 2]],
    ['date', { min: '2024-02-29', max: '2024-03-01' }, [0, '0']],
    ['choice', 0, [0, 2]],
    ['choice', '0', ['0']],
    ['note', 'empty', [0, '0']],
    ['note', 'not-empty', [2]],
  ] as const) {
    table.clearColumnFilters();
    table.updateColumnFilter(id, value);
    await fixture.whenStable();
    expect(table.issue()).toBeNull();
    expect(ids(table), id).toEqual(expected);
  }
  table.clearColumnFilters();
  table.updateColumnFilter('label', 'alpha');
  table.updateColumnFilter('active', false);
  await fixture.whenStable();
  expect(ids(table)).toEqual([0]);
});
it('resets page without clearing typed selection; hidden conditions, native sort and CSV retain the same filtered rows', async () => {
  const fixture = await create(),
    table = fixture.componentInstance;
  table.selectAll(true);
  table.table.nextPage();
  await fixture.whenStable();
  expect(table.selection()).toEqual([0, '0', 2]);
  table.updateColumnFilter('label', 'alpha');
  await fixture.whenStable();
  expect(table.table.atoms.pagination.get().pageIndex).toBe(0);
  expect(table.selection()).toEqual([0, '0', 2]);
  fixture.componentRef.setInput('view', {
    hidden: ['label'],
    order: ['amount', 'label', 'active', 'date', 'choice', 'note'],
  });
  await fixture.whenStable();
  expect(ids(table)).toEqual([0, '0']);
  expect(table.columnFiltering.available().map((c) => c.id)).toContain('label');
  table.sort(table.table.getColumn('amount')!);
  await fixture.whenStable();
  table.sort(table.table.getColumn('amount')!);
  await fixture.whenStable();
  expect(table.table.getPrePaginatedRowModel().rows[0]?.original['id']).toBe('0');
  expect(table.exportContext().query.columnFilters).toEqual([
    { columnId: 'label', value: 'alpha' },
  ]);
  const csv = table.createCsv({ scope: 'filtered' });
  expect(csv.status).toBe('ready');
  if (csv.status === 'ready') expect(csv.rowCount).toBe(2);
  table.clearColumnFilters();
  await fixture.whenStable();
  expect(ids(table)).toHaveLength(3);
});
@Component({
  selector: 'haven-test-prefix-filter',
  standalone: true,
  imports: [FormField, HavenTextField],
  template: '<haven-text-field [formField]="field()" [label]="context().label" />',
})
class PrefixFilter {
  readonly context = input.required<HavenTableFilterContext>();
  readonly field = input.required<Field<string>>();
}
const prefix: HavenTableFilterRegistration = {
  component: PrefixFilter,
  valueSchema: () => ({ type: 'string' }),
  initialValue: () => '',
  accepts: (value) => typeof value === 'string',
  matches: (context) => String(context.value).startsWith(String(context.filterValue)),
};
it('uses a real custom FieldTree draft; Apply, cosmetic updates, owner invalidation and disabled guards are independent', async () => {
  const fixture = await create({
      columns: [
        { ...columns[0], filter: { id: 'host.prefix', params: { nested: { flag: true } } } },
      ],
      filters: createHavenTableFilters([['host.prefix', prefix]]),
    }),
    table = fixture.componentInstance;
  const panel = fixture.debugElement.query(By.directive(HavenTableFilterPanel))
    .componentInstance as HavenTableFilterPanel;
  panel.expanded.set(true);
  await fixture.whenStable();
  const card = fixture.debugElement.query(By.directive(HavenTableFilterCard))
    .componentInstance as HavenTableFilterCard;
  const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
    'haven-test-prefix-filter input',
  )!;
  input.value = 'Al';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await fixture.whenStable();
  expect(ids(table)).toHaveLength(3);
  fixture.componentRef.setInput('columns', [{ ...table.columns()[0], header: 'Renamed' }]);
  TestBed.inject(TranslocoService).setActiveLang('zh-CN');
  await fixture.whenStable();
  expect(card.draft()?.native.value()['value']).toBe('Al');
  await card.apply();
  await fixture.whenStable();
  expect(ids(table)).toEqual([0]);
  input.value = 'Be';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await fixture.whenStable();
  fixture.componentRef.setInput('owner', 'new-owner');
  await card.apply();
  await fixture.whenStable();
  expect(table.columnFilters()).toEqual([{ columnId: 'label', value: 'Al' }]);
  fixture.componentRef.setInput('disabled', true);
  await fixture.whenStable();
  card.clear();
  table.clearColumnFilters();
  expect(table.columnFilters()).toHaveLength(1);
  fixture.componentRef.setInput('disabled', false);
  fixture.componentRef.setInput('readonly', true);
  await fixture.whenStable();
  card.clear();
  await fixture.whenStable();
  expect(ids(table)).toHaveLength(3);
});
it('rejects invalid range drafts, surfaces unknown predicates and recovers from custom execution errors by clearing', async () => {
  const fixture = await create(),
    table = fixture.componentInstance;
  const panel = fixture.debugElement.query(By.directive(HavenTableFilterPanel))
    .componentInstance as HavenTableFilterPanel;
  panel.expanded.set(true);
  await fixture.whenStable();
  const card = fixture.debugElement.queryAll(By.directive(HavenTableFilterCard))[1]!
    .componentInstance as HavenTableFilterCard;
  card.draft()!.native.value.set({ value: { min: 4, max: 1 } });
  await card.apply();
  await fixture.whenStable();
  expect(table.columnFilters()).toEqual([]);
  card.draft()!.native.value.set({ value: { min: 0, max: 2 } });
  card.context().parseError('min', true);
  await card.apply();
  await fixture.whenStable();
  expect(table.columnFilters()).toEqual([]);
  card.context().parseError('min', false);
  await card.apply();
  await fixture.whenStable();
  expect(ids(table)).toEqual([0, '0']);
  fixture.componentRef.setInput('columnFilters', []);
  fixture.componentRef.setInput('columns', [{ ...columns[0], filter: { id: 'unknown' } }]);
  await fixture.whenStable();
  expect(table.issue()?.code).toBe('filterRegistry');
  fixture.componentRef.setInput(
    'filters',
    createHavenTableFilters([
      [
        'unknown',
        {
          ...prefix,
          matches: () => {
            throw new Error('host');
          },
        },
      ],
    ]),
  );
  fixture.componentRef.setInput('columnFilters', [{ columnId: 'label', value: 'a' }]);
  await fixture.whenStable();
  expect(table.issue()?.code).toBe('filterExecution');
  expect(table.createCsv({ scope: 'filtered' }).status).toBe('error');
  table.clearColumnFilters();
  await fixture.whenStable();
  expect(table.issue()).toBeNull();
});
it('sends supported remote conditions and definitions without locally filtering server rows; cancels replaced requests', async () => {
  const calls: { request: TableDataRequest; resolve: (page: TableDataPage) => void }[] = [];
  const adapter = {
    supportedColumnFilters: [{ columnId: 'label', filterId: 'text' }],
    load: (request: TableDataRequest) =>
      new Promise<TableDataPage>((resolve) => calls.push({ request, resolve })),
  };
  const query: TableQuery = { pageIndex: 2, pageSize: 2, sort: [], filter: '' };
  const fixture = await create({ source: { identity: 'remote', adapter }, query }),
    table = fixture.componentInstance;
  expect(table.columnFiltering.available().map((c) => c.id)).toEqual(['label']);
  expect(table.columnFiltering.unsupportedRemote()).toBe(true);
  table.updateColumnFilter('label', 'never appears in response');
  await fixture.whenStable();
  expect(calls[0]!.request.signal.aborted).toBe(true);
  expect(calls[1]!.request).toMatchObject({
    pageIndex: 0,
    columnFilters: [{ columnId: 'label', value: 'never appears in response' }],
    columnFilterDefinitions: [{ columnId: 'label', filterId: 'text', params: {} }],
  });
  calls[1]!.resolve({ rows: [rows[2]!], total: 1 });
  await fixture.whenStable();
  await expect.poll(() => table.dataState().status).toBe('ready');
  await fixture.whenStable();
  expect(table.table.getRowModel().rows.map((row) => row.original['id'])).toEqual([2]);
  calls[0]!.resolve({ rows: [], total: 0 });
  await fixture.whenStable();
  expect(table.table.getRowModel().rows.map((row) => row.original['id'])).toEqual([2]);
  fixture.componentRef.setInput('query', {
    ...table.query(),
    columnFilters: [{ columnId: 'active', value: false }],
  });
  await fixture.whenStable();
  expect(table.dataState().error).toBe('query');
  expect(calls).toHaveLength(2);
});
it('applies actual native range inputs including open-ended dates and preserves numeric zero', async () => {
  const fixture = await create(),
    table = fixture.componentInstance;
  const panel = fixture.debugElement.query(By.directive(HavenTableFilterPanel))
    .componentInstance as HavenTableFilterPanel;
  panel.expanded.set(true);
  await fixture.whenStable();
  const cards = fixture.debugElement.queryAll(By.directive(HavenTableFilterCard));
  const number = cards[1]!.componentInstance as HavenTableFilterCard;
  const inputs = cards[1]!.nativeElement.querySelectorAll('input') as NodeListOf<HTMLInputElement>;
  inputs[0]!.value = '0';
  inputs[0]!.dispatchEvent(new Event('input', { bubbles: true }));
  inputs[1]!.value = '0';
  inputs[1]!.dispatchEvent(new Event('input', { bubbles: true }));
  await fixture.whenStable();
  await number.apply();
  await fixture.whenStable();
  expect(table.columnFilters()).toEqual([{ columnId: 'amount', value: { min: 0, max: 0 } }]);
  expect(ids(table)).toEqual([0]);
  table.clearColumnFilters();
  await fixture.whenStable();
  const date = cards[3]!.componentInstance as HavenTableFilterCard;
  expect(date.draft()?.native.value()['value']).toEqual({ min: null, max: null });
  const dates = cards[3]!.nativeElement.querySelectorAll('input') as NodeListOf<HTMLInputElement>;
  dates[0]!.value = '2024-03-01';
  dates[0]!.dispatchEvent(new Event('input', { bubbles: true }));
  await fixture.whenStable();
  await date.apply();
  await fixture.whenStable();
  expect(table.columnFilters()).toEqual([
    { columnId: 'date', value: { min: '2024-03-01', max: null } },
  ]);
  expect(ids(table)).toEqual(['0', 2]);
});
it('invalidates drafts on filter params, registry and mode changes while malformed controlled state stays diagnosable', async () => {
  const fixture = await create({
      columns: [{ ...columns[0], filter: { id: 'host.prefix', params: { tag: 'a' } } }],
      filters: createHavenTableFilters([['host.prefix', prefix]]),
    }),
    table = fixture.componentInstance;
  const panel = fixture.debugElement.query(By.directive(HavenTableFilterPanel))
    .componentInstance as HavenTableFilterPanel;
  panel.expanded.set(true);
  await fixture.whenStable();
  const card = fixture.debugElement.query(By.directive(HavenTableFilterCard))
    .componentInstance as HavenTableFilterCard;
  card.draft()!.native.value.set({ value: 'Al' });
  fixture.componentRef.setInput('columns', [
    { ...table.columns()[0], filter: { id: 'host.prefix', params: { tag: 'b' } } },
  ]);
  await card.apply();
  await fixture.whenStable();
  expect(table.columnFilters()).toEqual([]);
  expect(card.draft()?.native.value()['value']).toBe('');
  card.draft()!.native.value.set({ value: 'Al' });
  fixture.componentRef.setInput(
    'filters',
    createHavenTableFilters([['host.prefix', { ...prefix }]]),
  );
  await card.apply();
  await fixture.whenStable();
  expect(table.columnFilters()).toEqual([]);
  fixture.componentRef.setInput('columnFilters', null);
  await fixture.whenStable();
  expect(table.issue()?.code).toBe('columnFilters');
  table.clearColumnFilters();
  await fixture.whenStable();
  expect(table.issue()).toBeNull();
});
it('cancels params/capability/owner changes, rejects late data and retains typed selection across condition updates', async () => {
  const calls: { request: TableDataRequest; resolve: (page: TableDataPage) => void }[] = [];
  const load = (request: TableDataRequest) =>
    new Promise<TableDataPage>((resolve) => calls.push({ request, resolve }));
  const adapter = {
    supportedColumnFilters: [{ columnId: 'label', filterId: 'host.prefix' }],
    load,
  };
  const fixture = await create({
      columns: [{ ...columns[0], filter: { id: 'host.prefix', params: { version: 1 } } }],
      filters: createHavenTableFilters([
        [
          'host.prefix',
          {
            ...prefix,
            matches: () => {
              throw new Error('remote must not run');
            },
          },
        ],
      ]),
      source: { identity: 'remote', adapter },
      query: {
        pageIndex: 0,
        pageSize: 2,
        sort: [],
        filter: '',
        columnFilters: [{ columnId: 'label', value: 'a' }],
      },
    }),
    table = fixture.componentInstance;
  calls[0]!.resolve({ rows: rows.slice(0, 2), total: 2 });
  await expect.poll(() => table.dataState().status).toBe('ready');
  await fixture.whenStable();
  table.selectAll(true);
  await fixture.whenStable();
  expect(table.selection()).toEqual([0, '0']);
  expect(table.issue()).toBeNull();
  table.updateColumnFilter('label', 'b');
  await fixture.whenStable();
  expect(table.selection()).toEqual([0, '0']);
  fixture.componentRef.setInput('columns', [
    { ...table.columns()[0], filter: { id: 'host.prefix', params: { version: 2 } } },
  ]);
  await fixture.whenStable();
  expect(calls[1]!.request.signal.aborted).toBe(true);
  expect(calls[2]!.request.columnFilterDefinitions?.[0]?.params).toEqual({ version: 2 });
  adapter.supportedColumnFilters = [];
  fixture.componentRef.setInput('source', { identity: 'remote', adapter });
  await fixture.whenStable();
  expect(calls[2]!.request.signal.aborted).toBe(true);
  expect(table.dataState().error).toBe('query');
  expect(table.selection()).toEqual([0, '0']);
  calls[1]!.resolve({ rows: [rows[2]!], total: 1 });
  calls[2]!.resolve({ rows: [rows[2]!], total: 1 });
  await fixture.whenStable();
  expect(table.dataState().error).toBe('query');
  expect(table.displayedRows()).toEqual([]);
  fixture.componentRef.setInput('source', { identity: 'other', adapter });
  await fixture.whenStable();
  expect(table.selection()).toEqual([]);
});
