import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import type { DataSchema, JsonObject, TableColumn } from '@haven/schema';
import { editTable, typeTableInput } from '../../../../tests/ui/table-edit-support';
afterEach(() => TestBed.resetTestingModule());
const schema: DataSchema = {
  type: 'object',
  required: ['name', 'active'],
  properties: {
    id: { type: 'number' },
    name: { type: 'string', minLength: 2 },
    metadata: { type: 'number' },
    active: { type: 'boolean' },
  },
};
const columns: TableColumn[] = [
  { id: 'name', header: 'Name', path: '/name', editor: { id: 'text' } },
];
async function attempt(row: JsonObject) {
  const t = await editTable('cell', columns, schema, [
    { id: 0, name: 'First', metadata: 7, active: true },
  ]);
  const commit = vi.fn(async () => ({ status: 'applied', row }));
  t.fixture.componentRef.setInput('editHandler', { commit });
  await t.fixture.whenStable();
  t.button('Edit').click();
  await t.fixture.whenStable();
  typeTableInput(
    t.root.querySelector<HTMLInputElement>('haven-table-editor-outlet input')!,
    'Changed',
  );
  await t.fixture.whenStable();
  const committed = vi.fn();
  t.table.editCommitted.subscribe(committed);
  await t.table.editing.save();
  await t.fixture.whenStable();
  expect(commit).toHaveBeenCalledTimes(1);
  return { t, committed };
}
it('rejects canonical result with a non-edited number field changed to string', async () => {
  const { t, committed } = await attempt({ id: 0, name: 'Changed', metadata: 'bad', active: true });
  expect(committed).not.toHaveBeenCalled();
  expect(t.table.editing.error()).toBe('response');
  expect(t.table.editing.session()).not.toBeNull();
});
it('rejects missing required boolean instead of accepting a synthesized false', async () => {
  const { t, committed } = await attempt({ id: 0, name: 'Changed', metadata: 7 });
  expect(committed).not.toHaveBeenCalled();
  expect(t.table.editing.error()).toBe('response');
  expect(t.table.editing.session()).not.toBeNull();
});
it('accepts a canonical row with an explicitly present true required boolean', async () => {
  const { t, committed } = await attempt({ id: 0, name: 'Changed', metadata: 7, active: true });
  expect(committed).toHaveBeenCalledTimes(1);
  expect(t.table.editing.session()).toBeNull();
});

it('current native required boolean behavior rejects explicit false as well', async () => {
  const { t, committed } = await attempt({ id: 0, name: 'Changed', metadata: 7, active: false });
  expect(committed).not.toHaveBeenCalled();
  expect(t.table.editing.error()).toBe('response');
});
