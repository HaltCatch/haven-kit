import { Component, computed, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FormField } from '@angular/forms/signals';
import type { Field } from '@angular/forms/signals';
import { HavenTextField, HavenTemporalField } from '@haven/ui/form';
import { createHavenTableEditors } from '@haven/ui/table';
import type { HavenTableEditorContext, HavenTableCellContext } from '@haven/ui/table';
import type { TableColumn, DataSchema } from '@haven/schema';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatTooltipHarness } from '@angular/material/tooltip/testing';
import { MatSelectHarness } from '@angular/material/select/testing';
import { MatRadioGroupHarness } from '@angular/material/radio/testing';
import { afterEach, expect, it, vi } from 'vitest';
import { editTable, typeTableInput } from '../../../../tests/ui/table-edit-support';
@Component({
  imports: [FormField, HavenTextField],
  template: `<haven-text-field [formField]="control()" [label]="context().label" />`,
})
class CustomEditor {
  readonly context = input.required<HavenTableEditorContext>();
  readonly field = input.required<Field<unknown>>();
  readonly control = computed(() => this.field() as Field<string>);
}
afterEach(() => TestBed.resetTestingModule());
it('supports a registered real Angular editor through the native field and isolated immutable context', async () => {
  const columns: TableColumn[] = [
    {
      id: 'name',
      header: 'Custom name',
      path: '/name',
      editor: { id: 'custom.name', params: { nested: { safe: true } } },
    },
  ];
  const t = await editTable('cell', columns);
  t.fixture.componentRef.setInput(
    'editors',
    createHavenTableEditors([['custom.name', { component: CustomEditor, valueTypes: ['string'] }]]),
  );
  await t.fixture.whenStable();
  t.button('Edit').click();
  await t.fixture.whenStable();
  const editor = t.fixture.debugElement.query(By.directive(CustomEditor))
    .componentInstance as CustomEditor;
  expect(Object.isFrozen(editor.context().params['nested'])).toBe(true);
  expect(Object.isFrozen(editor.field())).toBe(false);
  typeTableInput(t.root.querySelector<HTMLInputElement>('haven-table-editor-outlet input')!, 'X');
  await t.fixture.whenStable();
  await t.table.editing.save();
  expect(t.rows()[0]!.name).toBe('First');
  typeTableInput(
    t.root.querySelector<HTMLInputElement>('haven-table-editor-outlet input')!,
    'Custom',
  );
  await t.fixture.whenStable();
  await t.table.editing.save();
  await t.fixture.whenStable();
  expect(t.rows()[0]!.name).toBe('Custom');
});
it('synchronously rejects stale owner or handler even before the cancellation effect runs', async () => {
  for (const input of ['owner', 'editHandler'] as const) {
    const t = await editTable();
    const commit = vi.fn(async () => ({ status: 'error', code: 'failed' }));
    t.fixture.componentRef.setInput('editHandler', { commit });
    await t.fixture.whenStable();
    t.button('Edit row').click();
    await t.fixture.whenStable();
    typeTableInput(
      t.root.querySelector<HTMLInputElement>('haven-table-editor-outlet input')!,
      'Draft',
    );
    await t.fixture.whenStable();
    t.fixture.componentRef.setInput(input, input === 'owner' ? 'replacement' : { commit: vi.fn() });
    await t.table.editing.save();
    expect(commit).not.toHaveBeenCalled();
    t.fixture.destroy();
    TestBed.resetTestingModule();
  }
});
it('does not silently accept edits outside the current cell and retains failures for correction', async () => {
  const t = await editTable('cell');
  t.button('Edit').click();
  await t.fixture.whenStable();
  const session = t.table.editing.session()!;
  session.native.value.update((value) => ({ ...value, name: 'Draft', amount: 100 }));
  await t.fixture.whenStable();
  await t.table.editing.save();
  expect(t.table.editing.error()).toBe('scope');
  expect(t.rows()[0]).toMatchObject({ name: 'First', amount: 3 });
  session.native.value.update((value) => ({ ...value, amount: 3 }));
  await t.fixture.whenStable();
  await t.table.editing.save();
  await t.fixture.whenStable();
  expect(t.rows()[0]!.name).toBe('Draft');
});
it('reuses native date parse state, Material select and radio with canonical typed values', async () => {
  const schema: DataSchema = {
    type: 'object',
    required: ['when', 'choice'],
    properties: {
      id: { type: 'number' },
      when: { type: 'string' },
      choice: { type: 'number', enum: [0, 2] },
      radio: { type: 'string', enum: ['a', 'b'] },
    },
  };
  const columns: TableColumn[] = [
    { id: 'when', header: 'When', path: '/when', editor: { id: 'date' } },
    {
      id: 'choice',
      header: 'Choice',
      path: '/choice',
      editor: {
        id: 'select',
        params: {
          options: [
            { value: 0, label: 'Zero' },
            { value: 2, label: 'Two' },
          ],
        },
      },
    },
    {
      id: 'radio',
      header: 'Radio',
      path: '/radio',
      editor: {
        id: 'radio',
        params: {
          options: [
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
          ],
        },
      },
    },
  ];
  const t = await editTable('row', columns, schema, [
    { id: 0, when: '2026-11-06', choice: 0, radio: 'a' },
  ]);
  t.button('Edit row').click();
  await t.fixture.whenStable();
  const temporal = t.fixture.debugElement.query(By.directive(HavenTemporalField))
    .componentInstance as HavenTemporalField;
  temporal.onInput({ value: '', validity: { badInput: true } } as HTMLInputElement);
  await t.fixture.whenStable();
  await t.table.editing.save();
  expect(t.table.editing.session()).not.toBeNull();
  typeTableInput(t.root.querySelector<HTMLInputElement>('input[type="date"]')!, '2026-12-01');
  await t.fixture.whenStable();
  const loader = TestbedHarnessEnvironment.loader(t.fixture);
  const select = await loader.getHarness(MatSelectHarness);
  await select.open();
  await select.clickOptions({ text: 'Two' });
  expect(t.table.editing.session()).not.toBeNull();
  const radio = await loader.getHarness(MatRadioGroupHarness);
  await radio.checkRadioButton({ label: 'B' });
  await t.table.editing.save();
  await t.fixture.whenStable();
  expect(t.rows()[0]).toEqual({ id: 0, when: '2026-12-01', choice: 2, radio: 'b' });
});
it('keeps explicit failures and malformed handler responses in the draft, and disables inputs while awaiting', async () => {
  const t = await editTable();
  for (const result of [
    { status: 'error', code: 'host.rejected' },
    { status: 'applied', row: { id: 99 } },
    { status: 'applied', row: { id: 0 } },
    { status: 'applied', row: { id: 0, name: 'Valid', amount: -5, active: true } },
  ]) {
    t.fixture.componentRef.setInput('editHandler', { commit: async () => result });
    await t.fixture.whenStable();
    t.button('Edit row').click();
    await t.fixture.whenStable();
    typeTableInput(
      t.root.querySelector<HTMLInputElement>('haven-table-editor-outlet input')!,
      'Retained',
    );
    await t.fixture.whenStable();
    await t.table.editing.save();
    await t.fixture.whenStable();
    expect(t.table.editing.session()).not.toBeNull();
    expect(t.rows()[0]!.name).toBe('First');
    expect(t.root.querySelector<HTMLInputElement>('haven-table-editor-outlet input')!.value).toBe(
      'Retained',
    );
    t.table.editing.cancel();
    await t.fixture.whenStable();
  }
});

it('materializes a missing optional field for native editing without persisting untouched defaults', async () => {
  const t = await editTable(
    'cell',
    [{ id: 'name', header: 'Name', path: '/name', editor: { id: 'text' } }],
    {
      type: 'object',
      properties: { id: { type: 'number' }, name: { type: 'string' }, amount: { type: 'number' } },
    },
    [{ id: 0 }],
  );
  t.button('Edit').click();
  await t.fixture.whenStable();
  const input = t.root.querySelector<HTMLInputElement>('haven-table-editor-outlet input')!;
  expect(input.value).toBe('');
  typeTableInput(input, 'Added');
  await t.fixture.whenStable();
  await t.table.editing.save();
  await t.fixture.whenStable();
  expect(t.rows()[0]).toEqual({ id: 0, name: 'Added' });
  expect(Object.hasOwn(t.rows()[0]!, 'amount')).toBe(false);
});
it('keeps native keyboard cancel local and restores the stable cell trigger', async () => {
  const t = await editTable('cell');
  const before = structuredClone(t.rows());
  t.button('Edit').click();
  await t.fixture.whenStable();
  const input = t.root.querySelector<HTMLInputElement>('haven-table-editor-outlet input')!;
  typeTableInput(input, 'Discard');
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await t.fixture.whenStable();
  expect(t.table.editing.session()).toBeNull();
  expect(t.rows()).toEqual(before);
  expect(document.activeElement?.getAttribute('data-table-edit-column')).toBe('name');
});
it('exposes row actions without overwriting read-only permissions or sharing mutable row objects', async () => {
  const t = await editTable(),
    invoke = vi.fn();
  t.table.rowAction.subscribe(invoke);
  t.fixture.componentRef.setInput('rowActions', [
    { id: 'open', label: 'Open', kind: 'read', actions: ['open'] },
    { id: 'remove', label: 'Remove', kind: 'write', actions: ['remove'] },
  ]);
  t.fixture.componentRef.setInput('readonly', true);
  await t.fixture.whenStable();
  expect(t.button('Open').disabled).toBe(false);
  expect(t.button('Remove').disabled).toBe(true);
  t.button('Open').click();
  expect(invoke).toHaveBeenCalledOnce();
  expect(invoke.mock.calls[0]![0].row).not.toBe(t.rows()[0]);
  t.fixture.componentRef.setInput('disabled', true);
  await t.fixture.whenStable();
  expect(t.button('Open').disabled).toBe(true);
});

it('uses native Material tooltip text from an immutable provider context', async () => {
  const t = await editTable('cell', [
    {
      id: 'name',
      header: 'Name',
      path: '/name',
      tooltip: { provider: 'hint', params: { safe: true } },
      editor: { id: 'text' },
    },
  ]);
  const provider = vi.fn(
    (context: HavenTableCellContext) => `${context.value} · ${context.locale}`,
  );
  t.fixture.componentRef.setInput('tooltips', new Map([['hint', provider]]));
  await t.fixture.whenStable();
  const tooltip = await TestbedHarnessEnvironment.loader(t.fixture).getHarness(MatTooltipHarness);
  await tooltip.show();
  expect(await tooltip.getTooltipText()).toBe('First · en-US');
  expect(Object.isFrozen(provider.mock.calls[0]![0].row)).toBe(true);
  expect(
    t.root.querySelector('[aria-label="Information about Name"]')?.getAttribute('aria-describedby'),
  ).toBeTruthy();
});
