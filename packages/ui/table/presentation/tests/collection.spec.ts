import { TestBed } from '@angular/core/testing';
import type { TableColumn } from '@haven/schema';
import { afterEach, expect, it, vi } from 'vitest';
import { HavenTable } from '../../table';
import { setupTreeSelection } from '../../../../../tests/ui/tree-selection-support';
import { rows as treeRows, hierarchy, columns as treeColumns } from '../../hierarchy/tests/support';

const columns: TableColumn[] = [{ id: 'name', path: '/name', header: 'Name', type: 'text' }];
const rows = Array.from({ length: 100 }, (_, id) => ({ id, name: `Record ${id}` }));
afterEach(() => TestBed.resetTestingModule());
async function create(extra: Record<string, unknown> = {}) {
  setupTreeSelection();
  const fixture = TestBed.createComponent(HavenTable);
  for (const [key, value] of Object.entries({
    columns,
    rows,
    virtualization: {},
    filterable: true,
    selectable: true,
    exportable: true,
    ...extra,
  }))
    fixture.componentRef.setInput(key, value);
  await fixture.whenStable();
  return {
    fixture,
    table: fixture.componentInstance,
    element: fixture.nativeElement as HTMLElement,
  };
}
it('uses the complete native local collection, with native sorting/filtering/all-selection and non-windowed CSV', async () => {
  const t = await create();
  expect(t.table.table.getRowModel().rows).toHaveLength(100);
  expect(t.table.exportContext()).toMatchObject({
    pagination: 'none',
    query: { pageIndex: 0, pageSize: 10 },
  });
  expect(t.element.querySelector('nav[aria-label="Pagination"]')).toBeNull();
  expect(t.table.status()).toContain('single scroll collection');
  expect(t.element.textContent).toContain('Export current expanded collection');
  t.table.table.setSorting([{ id: 'name', desc: true }]);
  t.table.table.setGlobalFilter('Record 9');
  await t.fixture.whenStable();
  expect(t.table.table.getRowModel().rows).toHaveLength(11);
  expect(t.table.table.getRowModel().rows[0]!.original['id']).toBe(99);
  t.table.selectAll(true);
  await t.fixture.whenStable();
  expect(t.table.selection()).toHaveLength(11);
  expect(t.table.createCsv({ scope: 'page' })).toMatchObject({ status: 'ready', rowCount: 11 });
  expect(t.table.createCsv({ scope: 'filtered' })).toMatchObject({ status: 'ready', rowCount: 11 });
  t.fixture.componentRef.setInput('virtualization', undefined);
  await t.fixture.whenStable();
  expect(t.table.table.getRowModel().rows).toHaveLength(10);
  expect(t.table.exportContext().pagination).toBe('pages');
  expect(t.table.selection()).toHaveLength(11);
});
it('keeps remote pagination over the loaded page and never virtualizes or fetches the total', async () => {
  const load = vi.fn(async ({ pageIndex }: { pageIndex: number }) => ({
    rows: rows.slice(pageIndex * 20, (pageIndex + 1) * 20),
    total: 5000,
  }));
  const t = await create({
    source: { identity: 'virtual:remote', adapter: { load } },
    query: { pageIndex: 0, pageSize: 20, filter: '', sort: [] },
  });
  await expect.poll(() => t.table.dataState().status).toBe('ready');
  await t.fixture.whenStable();
  expect(t.table.table.getRowModel().rows).toHaveLength(20);
  expect(t.table.exportContext()).toMatchObject({ pagination: 'pages', total: 5000 });
  expect(t.table.createCsv({ scope: 'loaded-page' })).toMatchObject({
    status: 'ready',
    rowCount: 20,
  });
  expect(t.table.createCsv({ scope: 'filtered' })).toEqual({ status: 'error', code: 'scope' });
  t.fixture.componentRef.setInput('virtualization', { viewportHeight: 300, overscan: 2 });
  await t.fixture.whenStable();
  expect(load).toHaveBeenCalledTimes(1);
  t.table.table.nextPage();
  await expect.poll(() => load.mock.calls.length).toBe(2);
  await expect.poll(() => t.table.dataState().status).toBe('ready');
  await t.fixture.whenStable();
  expect(t.table.table.getRowModel().rows[0]!.original['id']).toBe(20);
  expect(load.mock.calls[1]![0]).not.toHaveProperty('virtualization');
  expect(t.table.table.getPageCount()).toBe(250);
});
it('keeps native expanded tree rows complete while bypassing local pagination and exports folded descendants separately', async () => {
  const t = await create({
    rows: treeRows,
    columns: treeColumns,
    hierarchy,
    pageSize: 1,
    expandedRowKeys: [0],
  });
  expect(t.table.table.getRowModel().rows.map((row) => row.original['id'])).toEqual([
    0,
    'b',
    'a',
    '0',
  ]);
  expect(t.table.createCsv({ scope: 'page' })).toMatchObject({ status: 'ready', rowCount: 4 });
  expect(t.table.createCsv({ scope: 'filtered' })).toMatchObject({ status: 'ready', rowCount: 6 });
  t.table.selectAll(true);
  await t.fixture.whenStable();
  expect(t.table.selection()).toHaveLength(6);
  expect(t.table.expandedRowKeys()).toEqual([0]);
});
it('fails closed for malformed direct virtualization configuration and recovers without a schema-specific bypass', async () => {
  const t = await create({ virtualization: { overscan: -1 } });
  expect(t.table.issue()).toEqual({ code: 'virtualization' });
  expect(t.element.querySelector('table')).toBeNull();
  t.fixture.componentRef.setInput('virtualization', {});
  await t.fixture.whenStable();
  expect(t.table.issue()).toBeNull();
  expect(t.element.querySelector('table')).not.toBeNull();
});
