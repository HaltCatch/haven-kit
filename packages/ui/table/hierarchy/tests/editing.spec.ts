import { Component, computed, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FormField } from '@angular/forms/signals';
import type { Field } from '@angular/forms/signals';
import { HavenTextField } from '@haven/ui/form';
import { createHavenTableEditors, createHavenTableCellRenderers } from '@haven/ui/table';
import type { HavenTableCellContext } from '@haven/ui/table';
import type { DataSchema, TableColumn } from '@haven/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { editTable, typeTableInput } from '../../../../../tests/ui/table-edit-support';
import { HavenTableHierarchyCell } from '../cell';

const schema: DataSchema = {
  type: 'object',
  required: ['name'],
  properties: {
    id: { type: 'string' },
    parent: { type: 'string' },
    alternate: { type: 'string' },
    name: { type: 'string', minLength: 2 },
    amount: { type: 'number' },
  },
};
const rows = [
  { id: 'root', parent: '', alternate: '', name: 'Root', amount: 4 },
  { id: 'child', parent: 'root', alternate: 'root', name: 'Child', amount: 2 },
];
const columns: TableColumn[] = [
  { id: 'name', path: '/name', header: 'Name', type: 'text', editor: { id: 'text' } },
  { id: 'amount', path: '/amount', header: 'Amount', type: 'number' },
  { id: 'parent', path: '/parent', header: 'Parent', type: 'text' },
];
async function editable(configured = columns) {
  const t = await editTable('cell', configured, schema, structuredClone(rows));
  t.fixture.componentRef.setInput('hierarchy', { parentPath: '/parent', rootValue: '' });
  t.fixture.componentRef.setInput('expandedRowKeys', ['root']);
  await t.fixture.whenStable();
  const start = async () => {
    t.root
      .querySelectorAll('tbody tr')[1]!
      .querySelector<HTMLButtonElement>('[data-table-edit-column="name"]')!
      .click();
    await t.fixture.whenStable();
    const input = t.root.querySelector<HTMLInputElement>('haven-table-editor-outlet input')!;
    typeTableInput(input, 'Child draft');
    await t.fixture.whenStable();
    return input;
  };
  return { ...t, start };
}
@Component({
  imports: [FormField, HavenTextField],
  template: `<haven-text-field [label]="context().label" [formField]="control()" />`,
})
class CustomEditor {
  readonly context = input.required<{ label: string }>();
  readonly field = input.required<Field<unknown>>();
  readonly control = computed(() => this.field() as Field<string>);
}
@Component({ template: `<span>{{ context().value }}</span>` })
class CustomCell {
  readonly context = input.required<HavenTableCellContext>();
}
afterEach(() => TestBed.resetTestingModule());

describe('canonical tree-row editing and live ownership', () => {
  it('keeps a pending child editor mounted through native and controlled collapse requests', async () => {
    const t = await editable(),
      input = await t.start();
    const session = t.table.editing.session();
    t.table.table.getRow('string:root', true).toggleExpanded(false);
    await t.fixture.whenStable();
    expect(t.table.expandedRowKeys()).toEqual(['root']);
    t.fixture.componentRef.setInput('expandedRowKeys', []);
    await t.fixture.whenStable();
    expect(t.table.table.getRowModel().rows.map((row) => row.id)).toEqual([
      'string:root',
      'string:child',
    ]);
    expect(t.table.editing.session()).toBe(session);
    expect(t.root.querySelector('haven-table-editor-outlet input')).toBe(input);
    expect(input.value).toBe('Child draft');
    t.table.editing.cancel();
    await t.fixture.whenStable();
    expect(t.table.table.getRowModel().rows.map((row) => row.id)).toEqual(['string:root']);
  });

  it('commits a real child custom editor through flat CAS and preserves canonical parent metadata/custom rendering', async () => {
    const customColumns: TableColumn[] = columns.map((column) =>
      column.id === 'name'
        ? { ...column, editor: { id: 'custom.name' }, renderer: 'custom.cell' }
        : column,
    );
    const t = await editable(customColumns);
    t.fixture.componentRef.setInput(
      'editors',
      createHavenTableEditors([
        ['custom.name', { component: CustomEditor, valueTypes: ['string'] }],
      ]),
    );
    t.fixture.componentRef.setInput(
      'cellRenderers',
      createHavenTableCellRenderers([['custom.cell', CustomCell]]),
    );
    await t.fixture.whenStable();
    const child = t.fixture.debugElement.queryAll(By.directive(CustomCell))[1]!
      .componentInstance as CustomCell;
    expect(child.context().rowKey).toBe('child');
    expect(child.context().row['parent']).toBe('root');
    expect(child.context().row['children']).toBeUndefined();
    await t.start();
    await t.table.editing.save();
    await t.fixture.whenStable();
    expect(t.rows()[1]).toMatchObject({
      id: 'child',
      parent: 'root',
      alternate: 'root',
      name: 'Child draft',
    });
    expect(t.rows()[0]?.['name']).toBe('Root');
    expect(t.rows()).toHaveLength(2);
    expect(t.table.expandedRowKeys()).toEqual(['root']);
    expect(t.table.table.getCoreRowModel().rows[0]!.subRows[0]!.original).toBe(t.rows()[1]);
  });

  it('refuses old child writes and expansion events synchronously after a valid hierarchy configuration change', async () => {
    const t = await editable();
    const original = t.table.editHandler()!;
    const commit = vi.fn(original.commit.bind(original));
    t.fixture.componentRef.setInput('editHandler', { commit });
    await t.fixture.whenStable();
    await t.start();
    const oldCell = t.fixture.debugElement.query(By.directive(HavenTableHierarchyCell))
      .componentInstance as HavenTableHierarchyCell;
    t.fixture.componentRef.setInput('hierarchy', { parentPath: '/alternate', rootValue: '' });
    await t.table.editing.save();
    oldCell.toggle();
    expect(commit).not.toHaveBeenCalled();
    expect(t.table.expandedRowKeys()).toEqual(['root']);
    await t.fixture.whenStable();
    expect(t.table.editing.session()).toBeNull();
    expect(t.rows()[1]?.['name']).toBe('Child');
  });

  it('blocks direct parent-path editor configuration and direct scope changes outside the active cell', async () => {
    const t = await editable(
      columns.map((column) =>
        column.id === 'parent' ? { ...column, editor: { id: 'text' } } : column,
      ),
    );
    expect(t.table.extensionIssue()).toBe('hierarchyPaths');
    t.table.editing.begin(t.rows()[1]!, ['parent']);
    expect(t.table.editing.session()).toBeNull();
    t.fixture.destroy();
    TestBed.resetTestingModule();
    const valid = await editable();
    await valid.start();
    valid.table.editing.session()!.native.value.update((value) => ({ ...value, parent: '' }));
    await valid.fixture.whenStable();
    await valid.table.editing.save();
    expect(valid.table.editing.error()).toBe('scope');
    expect(valid.rows()[1]?.['parent']).toBe('root');
  });

  it('rejects a cached expansion component output when only the direct owner changes before propagation', async () => {
    const t = await editable();
    const oldCell = t.fixture.debugElement.query(By.directive(HavenTableHierarchyCell))
      .componentInstance as HavenTableHierarchyCell;
    t.fixture.componentRef.setInput('owner', 'replacement');
    oldCell.toggle();
    expect(t.table.expandedRowKeys()).toEqual(['root']);
    await t.fixture.whenStable();
  });
});
