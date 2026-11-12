import { TestBed } from '@angular/core/testing';
import type { DataSchema, TableColumn } from '@haven/schema';
import { afterEach, expect, it, vi } from 'vitest';
import { editTable, typeTableInput } from '../../../../../tests/ui/table-edit-support';
import { remoteEditTable } from '../../../../../tests/ui/table-remote-edit-support';

const schema: DataSchema = {
  type: 'object',
  properties: { id: { type: 'number' }, parent: { type: 'number' }, name: { type: 'string' } },
};
const columns: TableColumn[] = [
  { id: 'name', path: '/name', header: 'Name', type: 'text', editor: { id: 'text' } },
];
const rows = Array.from({ length: 40 }, (_, id) => ({
  id,
  parent: id % 10 === 0 ? -1 : Math.floor(id / 10) * 10,
  name: `Record ${id}`,
}));
afterEach(() => TestBed.resetTestingModule());
async function create(mode: 'flat' | 'root-rows' | 'visible-rows', virtual = false) {
  const t = await editTable('cell', columns, schema, structuredClone(rows));
  if (mode !== 'flat') {
    t.fixture.componentRef.setInput('hierarchy', {
      parentPath: '/parent',
      rootValue: -1,
      pagination: mode,
    });
    t.fixture.componentRef.setInput('expandedRowKeys', [0, 10, 20, 30]);
  }
  t.fixture.componentRef.setInput('pageSize', mode === 'flat' ? 5 : 1);
  if (virtual)
    t.fixture.componentRef.setInput('virtualization', {
      viewportHeight: 160,
      estimateRowHeight: 40,
    });
  await t.fixture.whenStable();
  return t;
}
it.each(['flat', 'root-rows', 'visible-rows'] as const)(
  'preserves the same %s editor, focused input and draft through paged/virtual transitions and commits with flat CAS',
  async (mode) => {
    const t = await create(mode),
      page = mode === 'flat' ? 7 : mode === 'root-rows' ? 3 : 35;
    t.table.table.setPageIndex(page);
    await t.fixture.whenStable();
    t.root.querySelector<HTMLButtonElement>('[data-table-edit-row="number:35"]')!.click();
    await t.fixture.whenStable();
    const input = t.root.querySelector<HTMLInputElement>('haven-table-editor-outlet input')!,
      session = t.table.editing.session();
    typeTableInput(input, 'Retained draft');
    input.focus();
    await t.fixture.whenStable();
    t.fixture.componentRef.setInput('virtualization', {
      viewportHeight: 160,
      estimateRowHeight: 40,
    });
    await t.fixture.whenStable();
    expect(t.table.editing.session()).toBe(session);
    expect(t.root.querySelector('haven-table-editor-outlet input')).toBe(input);
    expect(document.activeElement).toBe(input);
    t.fixture.componentRef.setInput('virtualization', undefined);
    await t.fixture.whenStable();
    expect(t.table.table.atoms.pagination.get().pageIndex).toBe(page);
    expect(t.root.querySelector('haven-table-editor-outlet input')).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('Retained draft');
    await t.table.editing.save();
    await t.fixture.whenStable();
    expect(t.rows()[35]?.['name']).toBe('Retained draft');
    expect(t.rows()[35]?.['parent']).toBe(30);
    expect(t.rows()).toHaveLength(40);
  },
);
it.each(['flat', 'root-rows', 'visible-rows'] as const)(
  'anchors an initially virtual %s pending editor onto its native page when switching to pagination',
  async (mode) => {
    const t = await create(mode, true);
    t.table.editing.begin(t.rows()[35]!, ['name']);
    await t.fixture.whenStable();
    const input = t.root.querySelector<HTMLInputElement>('haven-table-editor-outlet input')!;
    expect(input).not.toBeNull();
    typeTableInput(input, 'Anchored draft');
    input.focus();
    await t.fixture.whenStable();
    t.fixture.componentRef.setInput('virtualization', undefined);
    await t.fixture.whenStable();
    expect(t.table.table.atoms.pagination.get().pageIndex).toBe(
      mode === 'flat' ? 7 : mode === 'root-rows' ? 3 : 35,
    );
    expect(t.root.querySelector('haven-table-editor-outlet input')).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('Anchored draft');
  },
);
it('rejects stale writes and pending-page anchoring after a same-tick owner change while leaving presentation outside the write owner', async () => {
  const t = await create('flat', true),
    original = t.table.editHandler()!;
  const commit = vi.fn(original.commit.bind(original));
  t.fixture.componentRef.setInput('editHandler', { commit });
  await t.fixture.whenStable();
  t.table.editing.begin(t.rows()[35]!, ['name']);
  await t.fixture.whenStable();
  const input = t.root.querySelector<HTMLInputElement>('haven-table-editor-outlet input')!;
  typeTableInput(input, 'Old draft');
  await t.fixture.whenStable();
  t.fixture.componentRef.setInput('owner', 'replacement');
  t.fixture.componentRef.setInput('virtualization', undefined);
  await t.table.editing.save();
  expect(commit).not.toHaveBeenCalled();
  await t.fixture.whenStable();
  expect(t.table.editing.session()).toBeNull();
  expect(t.table.table.atoms.pagination.get().pageIndex).toBe(0);
  expect(t.rows()[35]?.['name']).toBe('Record 35');
});

it.each(['cell', 'row'] as const)(
  'keeps a remote %s write session and query unchanged through virtual presentation changes',
  async (mode) => {
    const t = await remoteEditTable(mode);
    await t.start('Remote virtual draft');
    const input = t.root.querySelector<HTMLInputElement>('haven-table-editor-outlet input')!,
      session = t.table.editing.session(),
      query = t.table.query();
    input.focus();
    for (const config of [
      { viewportHeight: 160, overscan: 0 },
      { viewportHeight: 300, overscan: 3 },
      undefined,
    ]) {
      t.fixture.componentRef.setInput('virtualization', config);
      await t.fixture.whenStable();
      expect(t.table.query()).toBe(query);
      expect(t.loads).toHaveLength(1);
      expect(t.table.editing.session()).toBe(session);
      expect(t.root.querySelector('haven-table-editor-outlet input')).toBe(input);
      expect(document.activeElement).toBe(input);
    }
    await t.table.editing.save();
    await expect.poll(() => t.table.dataState().status).toBe('ready');
    await t.fixture.whenStable();
    expect(t.calls).toHaveLength(1);
    expect(t.localCalls).toHaveLength(0);
    expect(t.serverRows()[0]?.['name']).toBe('Remote virtual draft');
    expect(t.loads).toHaveLength(2);
  },
);
