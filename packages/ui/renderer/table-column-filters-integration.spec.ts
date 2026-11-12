import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { afterEach, expect, it } from 'vitest';
import type { HavenDocument } from '@haven/schema';
import { HavenRenderer } from './renderer';
import { HavenTable } from '@haven/ui/table';
import { HavenTableFilterPanel } from '../table/filter-panel';
import { HavenTableFilterCard } from '../table/filter-card';
import { setupTableEditTests } from '../../../tests/ui/table-edit-support';
afterEach(() => TestBed.resetTestingModule());
function document(): HavenDocument {
  return {
    schemaVersion: '1.0',
    id: 'filters',
    title: 'Filters',
    actions: {},
    resources: {},
    dataSchema: {
      type: 'object',
      properties: {
        rows: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'number' }, name: { type: 'string' } },
          },
        },
      },
    },
    ui: {
      id: 'table',
      kind: 'table',
      version: 1,
      bind: '/rows',
      props: {
        rowKey: '/id',
        pageSize: 1,
        columns: [{ id: 'name', header: 'Name', path: '/name', filter: { id: 'text' } }],
        columnFilters: [{ columnId: 'name', value: 'Al' }],
      },
    },
    theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
  };
}
async function create() {
  setupTableEditTests();
  const fixture = TestBed.createComponent(HavenRenderer);
  fixture.componentRef.setInput('document', document());
  fixture.componentRef.setInput('value', {
    rows: [
      { id: 0, name: 'Alpha' },
      { id: 1, name: 'Beta' },
      { id: 2, name: 'Alpha Two' },
    ],
  });
  await fixture.whenStable();
  const table = fixture.debugElement.query(By.directive(HavenTable))
    .componentInstance as HavenTable;
  const panel = fixture.debugElement.query(By.directive(HavenTableFilterPanel))
    .componentInstance as HavenTableFilterPanel;
  panel.expanded.set(true);
  await fixture.whenStable();
  const card = fixture.debugElement.query(By.directive(HavenTableFilterCard))
    .componentInstance as HavenTableFilterCard;
  return { fixture, table, card };
}
it('preserves local user conditions through a cosmetic model refresh and emits serializable filter values', async () => {
  const { fixture, table, card } = await create();
  const events: unknown[] = [];
  fixture.componentInstance.uiEvent.subscribe((event) => events.push(event));
  card.draft()!.native.value.set({ value: 'Be' });
  await card.apply();
  await fixture.whenStable();
  expect(table.columnFilters()).toEqual([{ columnId: 'name', value: 'Be' }]);
  expect(table.table.getRowModel().rows[0]?.original['id']).toBe(1);
  const next = structuredClone(fixture.componentInstance.document());
  next.ui.props!['columns'] = [
    { id: 'name', header: 'Renamed', path: '/name', filter: { id: 'text' } },
  ];
  fixture.componentRef.setInput('document', next);
  await fixture.whenStable();
  expect(table.columnFilters()).toEqual([{ columnId: 'name', value: 'Be' }]);
  expect(events).toContainEqual(
    expect.objectContaining({
      event: 'columnFiltersChange',
      value: [{ columnId: 'name', value: 'Be' }],
    }),
  );
});
it.each(['owner', 'disabled'] as const)(
  'blocks a retained filter Apply before %s propagates through the root template',
  async (kind) => {
    const { fixture, card } = await create();
    const events: unknown[] = [];
    fixture.componentInstance.uiEvent.subscribe((event) => events.push(event));
    card.draft()!.native.value.set({ value: 'Be' });
    const next = structuredClone(fixture.componentInstance.document());
    if (kind === 'owner') next.id = 'next';
    else
      next.ui.rules = { disabled: { op: 'eq', left: { literal: true }, right: { literal: true } } };
    fixture.componentRef.setInput('document', next);
    await card.apply();
    await fixture.whenStable();
    expect(events).toEqual([]);
    const table = fixture.debugElement.query(By.directive(HavenTable))
      .componentInstance as HavenTable;
    expect(table.columnFilters()).toEqual([{ columnId: 'name', value: 'Al' }]);
  },
);
it.each(['initial', 'revision', 'path', 'clear'] as const)(
  'blocks stale %s updates at the renderer boundary',
  async (kind) => {
    const { fixture, card, table } = await create();
    const events: unknown[] = [];
    fixture.componentInstance.uiEvent.subscribe((event) => events.push(event));
    card.draft()!.native.value.set({ value: 'Be' });
    const next = structuredClone(fixture.componentInstance.document());
    if (kind === 'revision') fixture.componentRef.setInput('host', { revision: 'next' });
    else {
      if (kind === 'initial')
        next.ui.props!['columnFilters'] = [{ columnId: 'name', value: 'Alpha' }];
      else if (kind === 'path')
        next.ui.props!['columns'] = [
          { id: 'name', header: 'Name', path: '/id', filter: { id: 'text' } },
        ];
      else next.id = 'next';
      fixture.componentRef.setInput('document', next);
    }
    if (kind === 'clear') table.clearColumnFilters();
    else await card.apply();
    await fixture.whenStable();
    expect(events).toEqual([]);
    const current = fixture.debugElement.query(By.directive(HavenTable))
      .componentInstance as HavenTable;
    expect(current.columnFilters()).toEqual([
      { columnId: 'name', value: kind === 'initial' ? 'Alpha' : 'Al' },
    ]);
  },
);
it('keeps readonly filtering available while guarded by the current root state', async () => {
  const { fixture, card } = await create();
  const next = structuredClone(fixture.componentInstance.document());
  next.ui.props!['readonly'] = true;
  fixture.componentRef.setInput('document', next);
  card.draft()!.native.value.set({ value: 'Be' });
  await card.apply();
  await fixture.whenStable();
  const table = fixture.debugElement.query(By.directive(HavenTable))
    .componentInstance as HavenTable;
  expect(table.readonly()).toBe(true);
  expect(table.columnFilters()).toEqual([{ columnId: 'name', value: 'Be' }]);
});
it('routes remote initial conditions/query events and preserves user state on a cosmetic refresh', async () => {
  const { fixture } = await create();
  const calls: import('@haven/runtime').TableDataRequest[] = [];
  const adapter: import('@haven/runtime').TableDataAdapter = {
    supportedColumnFilters: [{ columnId: 'name', filterId: 'text' }],
    load: async (request) => {
      calls.push(request);
      return { rows: [{ id: 1, name: 'Server result' }], total: 2 };
    },
  };
  const next = structuredClone(fixture.componentInstance.document());
  next.resources['records'] = { type: 'query', adapter: 'server' };
  next.ui.props!['resource'] = 'records';
  next.ui.props!['selectable'] = true;
  fixture.componentRef.setInput('host', { tables: new Map([['server', adapter]]) });
  fixture.componentRef.setInput('document', next);
  await fixture.whenStable();
  const table = fixture.debugElement.query(By.directive(HavenTable))
    .componentInstance as HavenTable;
  await expect.poll(() => table.dataState().status).toBe('ready');
  await fixture.whenStable();
  expect(calls.at(-1)?.columnFilters).toEqual([{ columnId: 'name', value: 'Al' }]);
  expect(table.table.getRowModel().rows[0]?.original['name']).toBe('Server result');
  const events: unknown[] = [];
  fixture.componentInstance.uiEvent.subscribe((event) => events.push(event));
  table.selectAll(true);
  table.table.nextPage();
  await fixture.whenStable();
  await expect.poll(() => table.dataState().status).toBe('ready');
  await fixture.whenStable();
  table.updateColumnFilter('name', 'Be');
  await fixture.whenStable();
  await expect.poll(() => table.dataState().status).toBe('ready');
  await fixture.whenStable();
  expect(calls.at(-1)).toMatchObject({
    pageIndex: 0,
    columnFilters: [{ columnId: 'name', value: 'Be' }],
  });
  expect(table.selection()).toEqual([1]);
  expect(events).toContainEqual(
    expect.objectContaining({
      event: 'queryChange',
      value: expect.objectContaining({ columnFilters: [{ columnId: 'name', value: 'Be' }] }),
    }),
  );
  expect(events).not.toContainEqual(expect.objectContaining({ event: 'columnFiltersChange' }));
  const cosmetic = structuredClone(next);
  cosmetic.theme.preset = 'liquid-glass';
  cosmetic.ui.props!['title'] = 'New title';
  fixture.componentRef.setInput('document', cosmetic);
  await fixture.whenStable();
  expect(table.query().columnFilters).toEqual([{ columnId: 'name', value: 'Be' }]);
  expect(table.exportContext().query.columnFilters).toEqual([{ columnId: 'name', value: 'Be' }]);
});
it('diagnoses a malformed host filter capability without throwing during root ownership checks', async () => {
  const { fixture } = await create();
  const invalid: unknown[] = [];
  invalid.push(invalid);
  let loads = 0;
  const adapter: import('@haven/runtime').TableDataAdapter = {
    supportedColumnFilters: invalid as import('@haven/runtime').TableColumnFilterSupport[],
    load: async () => {
      loads++;
      return { rows: [], total: 0 };
    },
  };
  const next = structuredClone(fixture.componentInstance.document());
  next.resources['records'] = { type: 'query', adapter: 'server' };
  next.ui.props!['resource'] = 'records';
  fixture.componentRef.setInput('host', { tables: new Map([['server', adapter]]) });
  fixture.componentRef.setInput('document', next);
  await fixture.whenStable();
  const table = fixture.debugElement.query(By.directive(HavenTable))
    .componentInstance as HavenTable;
  expect(table.dataState().error).toBe('query');
  expect(loads).toBe(0);
});
