import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HavenTable } from '@haven/ui/table';
import { prepareTableEdit, ActionRegistry } from '@haven/runtime';
import type { TableEditHandler, TableEditRequest, TableDataAdapter } from '@haven/runtime';
import type { HavenDocument, JsonObject } from '@haven/schema';
import { validateDocument } from '@haven/schema';
import { HavenRenderer } from './renderer';
import {
  editColumns,
  editSchema,
  setupTableEditTests,
  typeTableInput,
} from '../../../tests/ui/table-edit-support';

beforeEach(setupTableEditTests);
afterEach(() => TestBed.resetTestingModule());

const document = (): HavenDocument => ({
  schemaVersion: '1.0',
  id: 'remote-editor',
  title: 'Remote editor',
  theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
  dataSchema: { type: 'object', properties: { rows: { type: 'array', items: editSchema } } },
  resources: { rows: { type: 'query', adapter: 'records.load' } },
  actions: { observe: { handler: 'records.observed' } },
  ui: {
    id: 'table',
    kind: 'table',
    version: 1,
    bind: '/rows',
    props: {
      columns: [
        { id: 'name', path: '/name', header: 'Name', type: 'text', editor: { id: 'text' } },
      ],
      rowKey: '/id',
      pageSize: 1,
      resource: 'rows',
      editMode: 'cell',
      editHandler: 'records.commit',
    },
    events: { editCommitted: ['observe'] },
  },
});

async function create() {
  const d = document();
  let rows: JsonObject[] = [{ id: 0, name: 'First', amount: 3, active: true }];
  const requests: TableEditRequest[] = [];
  const observed = vi.fn();
  const actions = new ActionRegistry();
  actions.register({
    id: 'records.observed',
    execute: async (_input, context) => {
      observed(context.event);
      return { status: 'success' };
    },
  });
  const load = vi.fn(async () => ({ rows, total: 1 }));
  const adapter: TableDataAdapter = { load };
  const commit = vi.fn(async (request: TableEditRequest) => {
    requests.push(request);
    const candidate = prepareTableEdit(rows, editColumns, '/id', request);
    if (candidate.status !== 'candidate') return candidate;
    const canonical = { ...candidate.row, name: String(candidate.row['name']).toUpperCase() };
    rows = [canonical];
    return { status: 'applied' as const, row: canonical };
  });
  const host = {
    actions,
    tables: new Map([['records.load', adapter]]),
    tableEdits: new Map<string, TableEditHandler>([['records.commit', { commit }]]),
    revision: 'first',
  };
  const f = TestBed.createComponent(HavenRenderer);
  f.componentRef.setInput('document', d);
  f.componentRef.setInput('host', host);
  f.componentRef.setInput('value', { rows: [] });
  await f.whenStable();
  expect(f.componentInstance.validation().diagnostics).toEqual([]);
  const table = f.debugElement.query(By.directive(HavenTable)).componentInstance as HavenTable;
  await expect.poll(() => table.dataState().status).toBe('ready');
  await f.whenStable();
  const root = f.nativeElement as HTMLElement;
  const start = async () => {
    root.querySelector<HTMLButtonElement>('[data-table-edit-column="name"]')!.click();
    await f.whenStable();
    typeTableInput(
      root.querySelector<HTMLInputElement>('haven-table-editor-outlet input')!,
      'Changed',
    );
    await f.whenStable();
  };
  return { f, table, host, d, start, requests, observed, commit, load };
}

it('consumes a named remote write port, reports canonical values and never writes remote rows into form data', async () => {
  const t = await create();
  await t.start();
  await t.table.editing.save();
  await t.f.whenStable();
  await expect.poll(() => t.observed.mock.calls.length).toBe(1);
  await expect.poll(() => t.table.dataState().status).toBe('ready');
  expect(t.requests[0]!.rowKey).toBe(0);
  expect(t.observed).toHaveBeenCalledExactlyOnceWith({
    type: 'editCommitted',
    value: { rowKey: 0, row: { id: 0, name: 'CHANGED', amount: 3, active: true } },
  });
  expect(t.f.componentInstance.value()).toEqual({ rows: [] });
  expect(t.table.displayedRows()[0]!['name']).toBe('CHANGED');
});

it('retains remote editor input through theme/title/header-only document replacements', async () => {
  const t = await create();
  await t.start();
  const session = t.table.editing.session();
  const next = structuredClone(t.d);
  next.theme.preset = 'liquid-glass';
  next.title = 'Retitled';
  (next.ui.props!['columns'] as { header: string }[])[0]!.header = 'Renamed header';
  t.f.componentRef.setInput('document', next);
  await t.f.whenStable();
  expect(t.table.editing.session()).toBe(session);
  expect(t.load).toHaveBeenCalledTimes(1);
  await t.table.editing.save();
  expect(t.commit).toHaveBeenCalledTimes(1);
});

it.each(['owner', 'handler', 'readonly'] as const)(
  'uses live renderer %s guards before stale child inputs can submit',
  async (change) => {
    const t = await create();
    await t.start();
    if (change === 'owner')
      t.f.componentRef.setInput('host', { ...t.host, revision: 'replacement' });
    if (change === 'handler')
      t.f.componentRef.setInput('host', {
        ...t.host,
        tableEdits: new Map([['records.commit', { commit: vi.fn() }]]),
      });
    if (change === 'readonly') {
      const next = structuredClone(t.d);
      next.ui.props!['readonly'] = true;
      t.f.componentRef.setInput('document', next);
    }
    await t.table.editing.save();
    expect(t.commit).not.toHaveBeenCalled();
  },
);

it('requires explicit stable handler ids and fails visibly when the host port is not registered', async () => {
  for (const props of [
    { editHandler: undefined },
    { editHandler: 'https://invalid' },
    { resource: undefined },
    { editMode: undefined },
  ]) {
    const d = document();
    Object.assign(d.ui.props!, props);
    for (const [key, value] of Object.entries(d.ui.props!))
      if (value === undefined) delete d.ui.props![key];
    expect(validateDocument(d).valid).toBe(false);
  }
  const t = await create();
  t.f.componentRef.setInput('host', { ...t.host, tableEdits: new Map() });
  await t.f.whenStable();
  expect(t.table.extensionIssue()).toBe('handler');
});
