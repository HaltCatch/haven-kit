import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import { TranslocoService } from '@jsverse/transloco';
import { HavenTable } from '../table';
import type { HavenTableCellContext } from '../cell-renderers';
import type { HavenTableCsvResult } from '../csv';
import type { TableColumn } from '@haven/schema';
import { editTable, setupTableEditTests } from '../../../../tests/ui/table-edit-support';
const columns: TableColumn[] = [
  {
    id: 'label',
    path: '/label',
    header: { default: 'Label', translations: { 'zh-CN': '名称' } },
    type: 'text',
  },
  { id: 'amount', path: '/amount', header: 'Amount', type: 'number' },
  { id: 'hidden', path: '/hidden', header: 'Secret', type: 'text' },
];
const rows = [
  { id: 0, label: 'Keep Ten', amount: 10, hidden: 'not exported' },
  { id: '0', label: 'Keep Two', amount: 2, hidden: 'not exported' },
  { id: 2, label: 'Omit', amount: 1, hidden: 'not exported' },
];
afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function create(extra: Record<string, unknown> = {}) {
  setupTableEditTests();
  const fixture = TestBed.createComponent(HavenTable);
  for (const [name, value] of Object.entries({
    columns,
    rows,
    pageSize: 1,
    filterable: true,
    exportable: true,
    view: { hidden: ['hidden'], order: ['label', 'amount'], pinned: { start: ['amount'] } },
    ...extra,
  }))
    fixture.componentRef.setInput(name, value);
  await fixture.whenStable();
  return { fixture, table: fixture.componentInstance, root: fixture.nativeElement as HTMLElement };
}
function csv(result: HavenTableCsvResult) {
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') throw new Error(result.code);
  return result;
}
it('exports native filtered/sorted rows across pages and the actual visible pinned column order', async () => {
  const t = await create();
  t.table.table.setGlobalFilter('Keep');
  t.table.table.setSorting([{ id: 'amount', desc: false }]);
  await t.fixture.whenStable();
  const all = csv(t.table.createCsv({ scope: 'filtered', bom: false }));
  expect(all.columnIds).toEqual(['amount', 'label']);
  expect(all.rowCount).toBe(2);
  expect(all.csv).toBe('"Amount","Label"\r\n"2","Keep Two"\r\n"10","Keep Ten"\r\n');
  t.table.table.nextPage();
  await t.fixture.whenStable();
  expect(csv(t.table.createCsv({ scope: 'page' })).csv).toBe(
    '\ufeff"Amount","Label"\r\n"10","Keep Ten"\r\n',
  );
  expect(t.table.createCsv({ scope: 'loaded-page' })).toEqual({ status: 'error', code: 'scope' });
  const state = t.table.exportContext();
  expect(state).toMatchObject({
    mode: 'local',
    query: { filter: 'Keep', sort: [{ columnId: 'amount', direction: 'asc' }] },
    total: 2,
  });
  expect(Object.isFrozen(state.query.sort)).toBe(true);
});
it('exports loaded remote pages only, refuses stale/loading rows, and never fetches every result', async () => {
  let resolve!: (value: { rows: typeof rows; total: number }) => void;
  const load = vi.fn(
    () => new Promise<{ rows: typeof rows; total: number }>((done) => (resolve = done)),
  );
  const t = await create({
    source: { identity: 'test', adapter: { load } },
    query: { pageIndex: 0, pageSize: 3, sort: [], filter: '' },
  });
  expect(t.table.createCsv({ scope: 'loaded-page' })).toEqual({
    status: 'error',
    code: 'unavailable',
  });
  resolve({ rows, total: 1000 });
  await expect.poll(() => t.table.dataState().status).toBe('ready');
  await t.fixture.whenStable();
  expect(csv(t.table.createCsv({ scope: 'loaded-page' })).rowCount).toBe(3);
  expect(t.table.createCsv({ scope: 'filtered' })).toEqual({ status: 'error', code: 'scope' });
  expect(load).toHaveBeenCalledTimes(1);
  expect(t.table.exportContext().total).toBe(1000);
  expect(t.root.textContent).toContain('Export loaded page only');
  expect(t.root.textContent).not.toContain('Export filtered rows');
  t.table.table.nextPage();
  expect(t.table.createCsv({ scope: 'loaded-page' })).toEqual({
    status: 'error',
    code: 'unavailable',
  });
});
@Component({ selector: 'haven-csv-cell', template: 'Custom DOM text' })
class CustomCell {
  readonly context = input.required<HavenTableCellContext>();
}
it('never scrapes custom renderer HTML and protects trusted formatter output using isolated contexts', async () => {
  const t = await create({
    rows: [{ id: 0, value: { name: 'raw' } }],
    columns: [{ id: 'value', path: '/value', header: '=header', renderer: 'custom' }],
    view: {},
    cellRenderers: new Map([['custom', CustomCell]]),
  });
  expect(t.table.createCsv({ scope: 'page' })).toEqual({
    status: 'error',
    code: 'value',
    columnId: 'value',
  });
  expect(csv(t.table.createCsv({ scope: 'page', objectValues: 'json', bom: false })).csv).toBe(
    '"\'=header"\r\n"{""name"":""raw""}"\r\n',
  );
  const formatter = vi.fn((context: HavenTableCellContext) => {
    expect(Object.isFrozen(context.row)).toBe(true);
    expect(context.rowKey).toBe(0);
    return '  ＝1+1';
  });
  expect(
    csv(
      t.table.createCsv({ scope: 'page', formatters: new Map([['value', formatter]]), bom: false }),
    ).csv,
  ).toBe('"\'=header"\r\n"\'  ＝1+1"\r\n');
  expect(formatter).toHaveBeenCalledTimes(1);
  expect(
    t.table.createCsv({
      scope: 'page',
      formatters: new Map([
        [
          'value',
          () => {
            throw new Error('fail');
          },
        ],
      ]),
    }),
  ).toEqual({ status: 'error', code: 'value', columnId: 'value' });
});
it('allows readonly export, blocks disabled export and preserves empty-table headers', async () => {
  const t = await create({ readonly: true, rows: [] });
  expect(csv(t.table.createCsv({ scope: 'filtered', bom: false })).csv).toBe(
    '"Amount","Label"\r\n',
  );
  t.fixture.componentRef.setInput('disabled', true);
  expect(t.table.createCsv({ scope: 'page' })).toEqual({ status: 'error', code: 'unavailable' });
  await t.fixture.whenStable();
  expect(
    [...t.root.querySelectorAll<HTMLButtonElement>('haven-table-export-controls button')].every(
      (b) => b.disabled,
    ),
  ).toBe(true);
});
it('uses current localized headers and exports through native Blob URLs with cleanup', async () => {
  const t = await create();
  TestBed.inject(TranslocoService).setTranslation({ haven: {} }, 'zh-CN');
  TestBed.inject(TranslocoService).setActiveLang('zh-CN');
  await t.fixture.whenStable();
  expect(csv(t.table.createCsv({ scope: 'page' })).csv).toContain('名称');
  const createUrl = vi.fn((blob: Blob) => {
      expect(blob).toBeInstanceOf(Blob);
      return 'blob:csv';
    }),
    revoke = vi.fn();
  vi.stubGlobal(
    'URL',
    Object.assign(class {}, { createObjectURL: createUrl, revokeObjectURL: revoke }),
  );
  const clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const result = t.table.downloadCsv({ scope: 'page' }, 'sample.csv');
  expect(result.status).toBe('ready');
  expect(clicked).toHaveBeenCalledOnce();
  expect(createUrl.mock.calls[0]?.[0]).toBeInstanceOf(Blob);
  await expect.poll(() => revoke.mock.calls.length).toBe(1);
  expect(document.querySelector('a[download]')).toBeNull();
});
it('does not download or expose partial CSV after a formatter or browser failure', async () => {
  const t = await create();
  const createUrl = vi.fn(() => {
    throw new Error('unsupported');
  });
  vi.stubGlobal(
    'URL',
    Object.assign(class {}, { createObjectURL: createUrl, revokeObjectURL: vi.fn() }),
  );
  expect(t.table.downloadCsv({ scope: 'page' })).toEqual({ status: 'error', code: 'download' });
  await t.fixture.whenStable();
  expect(t.root.querySelector('[role="alert"]')?.textContent).toContain('could not start');
  const fail = () => {
    throw new Error('formatter');
  };
  expect(
    t.table.downloadCsv({ scope: 'filtered', formatters: new Map([['label', fail]]) }),
  ).toEqual({ status: 'error', code: 'value', columnId: 'label' });
  expect(createUrl).toHaveBeenCalledTimes(1);
});
it('keeps one export snapshot when a formatter synchronously changes sort, filter, columns and row data', async () => {
  const t = await create();
  const seen: (string | number)[] = [];
  const formatter = (context: HavenTableCellContext) => {
    seen.push(context.rowKey);
    if (seen.length === 1) {
      t.table.table.setSorting([{ id: 'amount', desc: true }]);
      t.table.table.setGlobalFilter('Omit');
      t.fixture.componentRef.setInput('columns', [
        { id: 'label', path: '/hidden', header: 'Changed' },
      ]);
      t.fixture.componentRef.setInput('rows', [{ id: 99, label: 'New', hidden: 'Changed' }]);
    }
    return String(context.value);
  };
  const result = csv(
    t.table.createCsv({
      scope: 'filtered',
      bom: false,
      formatters: new Map([['label', formatter]]),
    }),
  );
  expect(seen).toEqual([0, '0', 2]);
  expect(result.columnIds).toEqual(['amount', 'label']);
  expect(result.csv).toBe(
    '"Amount","Label"\r\n"10","Keep Ten"\r\n"2","Keep Two"\r\n"1","Omit"\r\n',
  );
});
it('checks the byte budget even for empty rows with a native oversized header', async () => {
  const t = await create({ rows: [] });
  t.table.table.getColumn('label')!.columnDef.header = 'x'.repeat(12 * 1024 * 1024);
  expect(t.table.createCsv({ scope: 'filtered' })).toEqual({ status: 'error', code: 'limit' });
});

it('blocks export of active drafts and resumes from committed rows after cancellation', async () => {
  const t = await editTable();
  t.table.editing.begin(t.rows()[0]!, ['name']);
  await t.fixture.whenStable();
  expect(t.table.editing.session()).not.toBeNull();
  expect(t.table.createCsv({ scope: 'filtered' })).toEqual({
    status: 'error',
    code: 'unavailable',
  });
  t.table.editing.cancel();
  await t.fixture.whenStable();
  expect(csv(t.table.createCsv({ scope: 'filtered' })).csv).toContain('First');
});
