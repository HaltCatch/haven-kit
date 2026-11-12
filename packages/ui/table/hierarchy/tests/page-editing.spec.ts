import { TestBed } from '@angular/core/testing';
import type { DataSchema, TableColumn } from '@haven/schema';
import { afterEach, expect, it } from 'vitest';
import { editTable, typeTableInput } from '../../../../../tests/ui/table-edit-support';

const schema: DataSchema = {
  type: 'object',
  properties: { id: { type: 'string' }, parent: { type: 'string' }, name: { type: 'string' } },
};
const columns: TableColumn[] = [
  { id: 'name', path: '/name', header: 'Name', type: 'text', editor: { id: 'text' } },
];
const rows = [
  { id: 'first', parent: '', name: 'First root' },
  { id: 'a', parent: 'first', name: 'First child' },
  { id: 'b', parent: 'first', name: 'Second child' },
  { id: 'second', parent: '', name: 'Second root' },
  { id: 'editing', parent: 'second', name: 'Edited child' },
  { id: 'd', parent: 'second', name: 'Final child' },
];
afterEach(() => TestBed.resetTestingModule());

it.each(['collapse', 'expand'] as const)(
  'keeps the same pending child editor mounted when a controlled %s moves its visible-page position',
  async (operation) => {
    const t = await editTable('cell', columns, schema, structuredClone(rows));
    t.fixture.componentRef.setInput('hierarchy', {
      parentPath: '/parent',
      rootValue: '',
      pagination: 'visible-rows',
    });
    t.fixture.componentRef.setInput('pageSize', 2);
    t.fixture.componentRef.setInput(
      'expandedRowKeys',
      operation === 'collapse' ? ['first', 'second'] : ['second'],
    );
    await t.fixture.whenStable();
    t.table.table.setPageIndex(operation === 'collapse' ? 2 : 1);
    await t.fixture.whenStable();
    t.root.querySelector<HTMLButtonElement>('[data-table-edit-row="string:editing"]')!.click();
    await t.fixture.whenStable();
    const input = t.root.querySelector<HTMLInputElement>('haven-table-editor-outlet input')!;
    typeTableInput(input, 'Anchored draft');
    input.focus();
    await t.fixture.whenStable();
    const session = t.table.editing.session();

    // A host-controlled expansion can move the edited row even though its own ancestors stay open.
    t.fixture.componentRef.setInput(
      'expandedRowKeys',
      operation === 'collapse' ? ['second'] : ['first', 'second'],
    );
    await t.fixture.whenStable();
    expect(t.table.table.atoms.pagination.get().pageIndex).toBe(operation === 'collapse' ? 1 : 2);
    expect(t.table.table.getRowModel().rows.map((row) => row.id)).toEqual([
      'string:editing',
      'string:d',
    ]);
    expect(t.table.editing.session()).toBe(session);
    expect(t.root.querySelector('haven-table-editor-outlet input')).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('Anchored draft');
    await t.table.editing.save();
    await t.fixture.whenStable();
    expect(t.rows()[4]?.['name']).toBe('Anchored draft');
    expect(t.rows()).toHaveLength(6);
  },
);
