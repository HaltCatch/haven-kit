import { Component, computed, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormField } from '@angular/forms/signals';
import type { Field } from '@angular/forms/signals';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatTooltipHarness } from '@angular/material/tooltip/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { HavenTextField } from '@haven/ui/form';
import {
  HavenTable,
  createHavenTableCellRenderers,
  createHavenTableEditors,
  createHavenTableFilters,
} from '@haven/ui/table';
import type { HavenTableCellContext } from '@haven/ui/table';
import type { TableColumn } from '@haven/schema';
import { afterEach, describe, expect, it } from 'vitest';
import {
  editTable,
  setupTableEditTests,
  typeTableInput,
} from '../../../../../tests/ui/table-edit-support';
import { remoteEditTable } from '../../../../../tests/ui/table-remote-edit-support';
import { cleanupHeaders, headerTable } from './support';

@Component({ template: `<strong>{{ context().params['prefix'] }} {{ context().value }}</strong>` })
class CustomCell {
  readonly context = input.required<HavenTableCellContext>();
}
@Component({
  imports: [FormField, HavenTextField],
  template: `<haven-text-field [label]="context().label" [formField]="control()" />`,
})
class CustomText {
  readonly context = input.required<{ label: string }>();
  readonly field = input.required<Field<unknown>>();
  readonly control = computed(() => this.field() as Field<string>);
}
afterEach(cleanupHeaders);
describe('grouped headers preserve extension contracts', () => {
  it('retains custom cells, custom predicates, tooltip and leaf CSV values without synthetic columns', async () => {
    setupTableEditTests();
    const fixture = TestBed.createComponent(HavenTable),
      table = fixture.componentInstance;
    const columns: TableColumn[] = [
      { id: 'name', path: '/name', header: 'Name', type: 'text', filter: { id: 'custom.prefix' } },
      {
        id: 'amount',
        path: '/amount',
        header: 'Amount',
        type: 'number',
        renderer: 'custom.value',
        rendererParams: { prefix: 'Value' },
        tooltip: { text: 'Details here' },
      },
    ];
    for (const [key, value] of Object.entries({
      columns,
      rows: [
        { id: 0, name: 'Keep first', amount: 3 },
        { id: '0', name: 'Omit', amount: 8 },
      ],
      headerGroups: [{ id: 'custom', header: 'Custom group', children: ['name', 'amount'] }],
      cellRenderers: createHavenTableCellRenderers([['custom.value', CustomCell]]),
      filters: createHavenTableFilters([
        [
          'custom.prefix',
          {
            component: CustomText,
            valueSchema: () => ({ type: 'string' }),
            initialValue: () => '',
            accepts: (value) => typeof value === 'string',
            matches: (context) => String(context.value).startsWith(String(context.filterValue)),
          },
        ],
      ]),
    }))
      fixture.componentRef.setInput(key, value);
    await fixture.whenStable();
    table.updateColumnFilter('name', 'Keep');
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(element.querySelector('tbody strong')?.textContent).toBe('Value 3');
    const tooltip = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatTooltipHarness);
    await tooltip.show();
    expect(await tooltip.getTooltipText()).toBe('Details here');
    const csv = table.createCsv({ scope: 'filtered', bom: false });
    expect(csv.status).toBe('ready');
    if (csv.status === 'ready') {
      expect(csv.columnIds).toEqual(['name', 'amount']);
      expect(csv.csv).toBe('"Name","Amount"\r\n"Keep first","3"\r\n');
    }
    expect(table.exportContext().columns.map((column) => column.id)).toEqual(['name', 'amount']);
    expect(table.table.getAllColumns()[0]?.id).toBe('group:custom');
    expect(table.table.getAllLeafColumns().map((column) => column.id)).toEqual(['name', 'amount']);
  });

  it('preserves a live custom editor and its native draft when only the header hierarchy changes', async () => {
    const columns: TableColumn[] = [
      { id: 'name', path: '/name', header: 'Name', type: 'text', editor: { id: 'custom.name' } },
      { id: 'amount', path: '/amount', header: 'Amount', type: 'number' },
    ];
    const t = await editTable('cell', columns);
    t.fixture.componentRef.setInput(
      'editors',
      createHavenTableEditors([['custom.name', { component: CustomText, valueTypes: ['string'] }]]),
    );
    t.fixture.componentRef.setInput('headerGroups', [
      { id: 'first', header: 'First group', children: ['name', 'amount'] },
    ]);
    await t.fixture.whenStable();
    t.button('Edit').click();
    await t.fixture.whenStable();
    const input = t.root.querySelector<HTMLInputElement>('haven-table-editor-outlet input')!;
    typeTableInput(input, 'Preserved');
    await t.fixture.whenStable();
    const session = t.table.editing.session();
    t.fixture.componentRef.setInput('headerGroups', [
      'amount',
      { id: 'second', header: 'Second group', children: ['name'] },
    ]);
    await t.fixture.whenStable();
    expect(t.table.editing.session()).toBe(session);
    expect(t.root.querySelector<HTMLInputElement>('haven-table-editor-outlet input')).toBe(input);
    expect(input.value).toBe('Preserved');
    await t.table.editing.save();
    await t.fixture.whenStable();
    expect(t.rows()[0]?.name).toBe('Preserved');
  });

  it('keeps the column menu leaf-only while hide, order, pin and width operations retain existing view IDs', async () => {
    const t = await headerTable({ columnMenu: true });
    const loader = TestbedHarnessEnvironment.loader(t.fixture);
    await (await loader.getHarness(MatButtonHarness.with({ text: 'Columns' }))).click();
    const controls = [...t.element.querySelectorAll<HTMLElement>('fieldset.columns .column')];
    expect(controls).toHaveLength(5);
    expect(controls.some((control) => control.textContent?.includes('Details'))).toBe(false);
    t.table.table.getColumn('name')!.pin('start');
    t.table.table.setColumnSizing({ name: 240 });
    t.table.table.getColumn('enabled')!.toggleVisibility(false);
    t.table.table.setColumnOrder(['score', 'tail', 'id', 'enabled', 'name']);
    await t.fixture.whenStable();
    expect(t.table.view()).toMatchObject({
      pinned: { start: ['name'] },
      widths: { name: 240 },
      hidden: ['enabled'],
      order: ['score', 'tail', 'id', 'enabled', 'name'],
    });
    expect(JSON.stringify(t.table.view())).not.toContain('group:');
  });

  it('changes remote header layout without rereading, losing a row draft, or sending group IDs in writes/queries', async () => {
    const t = await remoteEditTable();
    const before = t.loads.length;
    t.fixture.componentRef.setInput('headerGroups', [
      { id: 'first', header: 'First group', children: ['name', 'amount', 'active'] },
    ]);
    await t.fixture.whenStable();
    expect(t.loads).toHaveLength(before);
    await t.start('Remote draft');
    const session = t.table.editing.session();
    t.fixture.componentRef.setInput('headerGroups', [
      'active',
      { id: 'second', header: 'Second group', children: ['name', 'amount'] },
    ]);
    await t.fixture.whenStable();
    expect(t.table.editing.session()).toBe(session);
    expect(t.loads).toHaveLength(before);
    expect(session?.native.value()['name']).toBe('Remote draft');
    await t.table.editing.save();
    await expect.poll(() => t.table.dataState().status).toBe('ready');
    await t.fixture.whenStable();
    expect(t.calls[0]?.changes.map((change) => change.columnId)).toEqual(['name']);
    expect(t.serverRows()[0]?.['name']).toBe('Remote draft');
    t.table.table.getColumn('amount')!.toggleSorting();
    await t.fixture.whenStable();
    await expect.poll(() => t.loads.at(-1)?.sort[0]?.columnId).toBe('amount');
    expect(JSON.stringify(t.calls)).not.toContain('group:');
    expect(
      t.loads.every((request) => request.sort.every((sort) => !sort.columnId.startsWith('group:'))),
    ).toBe(true);
  });
});
