import { TestBed } from '@angular/core/testing';
import { expect } from 'vitest';
import { HavenTable } from '@haven/ui/table';
import { prepareTableEdit } from '@haven/runtime';
import type { TableDataRequest, TableEditHandler, TableEditRequest } from '@haven/runtime';
import type { JsonObject, TableQuery } from '@haven/schema';
import { editColumns, editSchema, setupTableEditTests, typeTableInput } from './table-edit-support';

/** Deterministic in-memory transport fixture, not a production persistence implementation. */
export async function remoteEditTable(mode: 'cell' | 'row' = 'row', handler?: TableEditHandler) {
  setupTableEditTests();
  const fixture = TestBed.createComponent(HavenTable);
  const table = fixture.componentInstance;
  const calls: TableEditRequest[] = [],
    loads: TableDataRequest[] = [];
  let rows: readonly JsonObject[] = [
    { id: 0, name: 'First', amount: 3, active: true },
    { id: 1, name: 'Second', amount: 8, active: false },
  ];
  const adapter = {
    load: async (request: TableDataRequest) => {
      loads.push(request);
      const start = request.pageIndex * request.pageSize;
      return { rows: rows.slice(start, start + request.pageSize), total: rows.length };
    },
  };
  const remoteHandler: TableEditHandler = handler ?? {
    commit: async (request) => {
      calls.push(request);
      const candidate = prepareTableEdit(rows, editColumns, '/id', request);
      if (candidate.status !== 'candidate') return candidate;
      rows = rows.map((row, index) => (index === candidate.index ? candidate.row : row));
      return { status: 'applied', row: candidate.row };
    },
  };
  const localCalls: TableEditRequest[] = [];
  const query: TableQuery = { pageIndex: 0, pageSize: 2, sort: [], filter: '' };
  for (const [key, value] of Object.entries({
    columns: editColumns,
    itemSchema: editSchema,
    editMode: mode,
    source: { identity: 'remote:one', adapter },
    query,
    remoteEditHandler: remoteHandler,
    rows: [{ id: 0, name: 'Local decoy', amount: 1, active: false }],
    editHandler: {
      commit: async (request: TableEditRequest) => {
        localCalls.push(request);
        return { status: 'error', code: 'local' };
      },
    },
  }))
    fixture.componentRef.setInput(key, value);
  await fixture.whenStable();
  await expect.poll(() => table.dataState().status).toBe('ready');
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const button = (text: string) =>
    [...root.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === text,
    )!;
  const start = async (name = 'Changed') => {
    button(mode === 'cell' ? 'Edit' : 'Edit row').click();
    await fixture.whenStable();
    typeTableInput(root.querySelector<HTMLInputElement>('haven-table-editor-outlet input')!, name);
    await fixture.whenStable();
  };
  return {
    fixture,
    table,
    root,
    button,
    start,
    calls,
    loads,
    localCalls,
    serverRows: () => rows,
    replaceServer: (next: readonly JsonObject[]) => {
      rows = next;
    },
  };
}
