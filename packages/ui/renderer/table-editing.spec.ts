import { Component, input } from '@angular/core';
import type { HavenTableCellContext } from '@haven/ui/table';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { afterEach, expect, it } from 'vitest';
import { HavenTable } from '@haven/ui/table';
import { ActionRegistry } from '@haven/runtime';
import type { ActionContext } from '@haven/runtime';
import type { HavenDocument, JsonObject } from '@haven/schema';
import { HavenRenderer } from './renderer';
import { submitValidated } from '@haven/ui/form-state';
import { HavenTableNode } from './table-node';
import { setupTableEditTests, typeTableInput } from '../../../tests/ui/table-edit-support';
const document = (): HavenDocument => ({
  schemaVersion: '1.0',
  id: 'table-edit',
  title: 'Table edit',
  theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
  resources: {},
  actions: { open: { handler: 'test.open' } },
  dataSchema: {
    type: 'object',
    properties: {
      groups: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            rows: {
              type: 'array',
              items: {
                type: 'object',
                required: ['name'],
                properties: {
                  id: { type: 'number' },
                  name: { type: 'string', minLength: 2 },
                  note: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  },
  ui: {
    id: 'groups',
    kind: 'form.repeat',
    version: 1,
    bind: '/groups',
    children: [
      {
        id: 'grid',
        kind: 'table',
        version: 1,
        bind: '/rows',
        props: {
          rowKey: '/id',
          editMode: 'cell',
          columns: [{ id: 'name', header: 'Name', path: '/name', editor: { id: 'text' } }],
          rowActions: [{ id: 'open', label: 'Open row', kind: 'read', actions: ['open'] }],
        },
      },
    ],
  },
});
afterEach(() => TestBed.resetTestingModule());
async function render(custom = false) {
  setupTableEditTests();
  const fixture = TestBed.createComponent(HavenRenderer);
  const model = document();
  if (custom) {
    const column = (model.ui.children![0]!.props!['columns'] as JsonObject[])[0]!;
    column['renderer'] = 'test.cell';
    column['type'] = 'text';
    fixture.componentRef.setInput('host', {
      tableCellRenderers: new Map([['test.cell', ReviewCell]]),
    });
  }
  fixture.componentRef.setInput('document', model);
  fixture.componentRef.setInput('value', {
    groups: [
      {
        title: 'Outer A',
        rows: [
          { id: 0, name: 'A0', note: 'Keep A' },
          { id: 1, name: 'A1', note: 'Keep B' },
        ],
      },
      { title: 'Outer B', rows: [{ id: 0, name: 'B0', note: 'Keep C' }] },
    ],
  });
  await fixture.whenStable();
  const tables = () => fixture.debugElement.queryAll(By.directive(HavenTable));
  return { fixture, renderer: fixture.componentInstance, tables };
}
it('commits through the real root field to the correct repeated table and preserves unrelated latest data', async () => {
  const t = await render();
  expect(t.renderer.validation().diagnostics).toEqual([]);
  const table = t.tables()[1]!.componentInstance as HavenTable,
    element = t.tables()[1]!.nativeElement as HTMLElement;
  element.querySelector<HTMLButtonElement>('[aria-label="Edit Name"]')!.click();
  await t.fixture.whenStable();
  typeTableInput(
    element.querySelector<HTMLInputElement>('haven-table-editor-outlet input')!,
    'Edited B',
  );
  await t.fixture.whenStable();
  // Root data updates during the draft must not be overwritten by a captured parent snapshot.
  t.renderer.value.update((data) => ({ ...data, extra: 'unrelated' }));
  await table.editing.save();
  await t.fixture.whenStable();
  const groups = t.renderer.value()['groups'] as JsonObject[];
  expect((groups[0]!['rows'] as JsonObject[])[0]!['name']).toBe('A0');
  expect(structuredClone((groups[1]!['rows'] as JsonObject[])[0])).toEqual({
    id: 0,
    name: 'Edited B',
    note: 'Keep C',
  });
  expect(t.renderer.value()['extra']).toBe('unrelated');
  expect(t.renderer.fields()?.().dirty()).toBe(true);
});

it('does not submit old root rows while a repeated table has an uncommitted edit', async () => {
  const t = await render();
  const table = t.tables()[1]!.componentInstance as HavenTable;
  table.editing.begin(table.displayedRows()[0]!, ['name']);
  let saved = 0;
  const action = async () => {
    saved++;
  };
  // The renderer must read the live table session in this tick, before its inputs/effects settle.
  expect(await t.renderer.submit({ action })).toBe(false);
  expect(await submitValidated(t.renderer.fields()!, { action })).toBe(false);
  expect(saved).toBe(0);
  table.editing.cancel();
  expect(await t.renderer.submit({ action })).toBe(true);
  expect(saved).toBe(1);
});
it('runs different row actions concurrently, keeps repeat item context, and cancels only removed row scope', async () => {
  const t = await render(),
    contexts: ActionContext[] = [],
    resolvers: (() => void)[] = [];
  const actions = new ActionRegistry();
  actions.register({
    id: 'test.open',
    execute: async (_input, context) => {
      contexts.push(context);
      await new Promise<void>((resolve) => resolvers.push(resolve));
      return { status: 'success' };
    },
  });
  t.fixture.componentRef.setInput('host', { actions });
  await t.fixture.whenStable();
  const element = t.tables()[0]!.nativeElement as HTMLElement;
  const buttons = [
    ...element.querySelectorAll<HTMLButtonElement>('haven-table-row-actions button'),
  ];
  buttons[0]!.click();
  buttons[1]!.click();
  await t.fixture.whenStable();
  expect(contexts).toHaveLength(2);
  expect((contexts[0]!.item as JsonObject)['title']).toBe('Outer A');
  expect(((contexts[0]!.event as JsonObject)['value'] as JsonObject)['rowKey']).toBe(0);
  expect(((contexts[1]!.event as JsonObject)['value'] as JsonObject)['rowKey']).toBe(1);
  expect(Object.isFrozen(((contexts[0]!.event as JsonObject)['value'] as JsonObject)['row'])).toBe(
    true,
  );
  const groups = t.renderer.value()['groups'] as JsonObject[];
  t.renderer.value.set({
    groups: [{ ...groups[0]!, rows: [(groups[0]!['rows'] as JsonObject[])[1]!] }, groups[1]!],
  });
  await t.fixture.whenStable();
  expect(contexts[0]!.signal.aborted).toBe(true);
  expect(contexts[1]!.signal.aborted).toBe(false);
  resolvers.forEach((resolve) => resolve());
  await t.fixture.whenStable();
});
it('retains an edit through theme-only document replacement, but rejects a changed owner before write', async () => {
  const t = await render(),
    table = t.tables()[0]!.componentInstance as HavenTable;
  const element = t.tables()[0]!.nativeElement as HTMLElement;
  element.querySelector<HTMLButtonElement>('[aria-label="Edit Name"]')!.click();
  await t.fixture.whenStable();
  typeTableInput(
    element.querySelector<HTMLInputElement>('haven-table-editor-outlet input')!,
    'Draft',
  );
  await t.fixture.whenStable();
  const session = table.editing.session();
  t.fixture.componentRef.setInput('document', {
    ...t.renderer.document(),
    theme: { preset: 'liquid-glass', mode: 'dark', density: 'compact' },
  });
  await t.fixture.whenStable();
  expect(table.editing.session()).toBe(session);
  t.fixture.componentRef.setInput('host', { revision: 'new-owner' });
  await t.fixture.whenStable();
  expect(table.editing.session()).toBeNull();
});

it('retains the same editor instance across repeat reorder and commits only to the moved group', async () => {
  const t = await render(),
    second = t.tables()[1]!,
    table = second.componentInstance as HavenTable;
  const root = second.nativeElement as HTMLElement;
  root.querySelector<HTMLButtonElement>('[aria-label="Edit Name"]')!.click();
  await t.fixture.whenStable();
  const input = root.querySelector<HTMLInputElement>('haven-table-editor-outlet input')!;
  typeTableInput(input, 'Moved B');
  await t.fixture.whenStable();
  const session = table.editing.session();
  t.renderer.value.update((value) => ({
    ...value,
    groups: [...(value['groups'] as JsonObject[])].reverse(),
  }));
  await t.fixture.whenStable();
  expect(t.tables()[0]!.componentInstance).toBe(table);
  expect(table.editing.session()).toBe(session);
  expect(root.querySelector('haven-table-editor-outlet input')).toBe(input);
  await table.editing.save();
  await t.fixture.whenStable();
  const groups = t.renderer.value()['groups'] as JsonObject[];
  expect((groups[0]!['rows'] as JsonObject[])[0]!['name']).toBe('Moved B');
  expect((groups[1]!['rows'] as JsonObject[])[0]!['name']).toBe('A0');
});

@Component({ selector: 'haven-review-cell', template: '{{ context().value }}' })
class ReviewCell {
  readonly context = input.required<HavenTableCellContext>();
}
it('projects native rows for custom cells after document changes while edits retain native CAS and unrelated row identity', async () => {
  const t = await render(true);
  const table = t.tables()[0]!.componentInstance as HavenTable;
  const groups = t.renderer.value()['groups'] as JsonObject[];
  const originalRows = groups[0]!['rows'] as JsonObject[];
  expect(Object.getOwnPropertySymbols(originalRows[0]!).length).toBeGreaterThan(0);
  expect(table.issue()).toBeNull();
  t.fixture.componentRef.setInput('document', structuredClone(t.renderer.document()));
  await t.fixture.whenStable();
  expect(table.issue()).toBeNull();
  const root = t.tables()[0]!.nativeElement as HTMLElement;
  root.querySelector<HTMLButtonElement>('[aria-label="Edit Name"]')!.click();
  await t.fixture.whenStable();
  typeTableInput(
    root.querySelector<HTMLInputElement>('haven-table-editor-outlet input')!,
    'Native edited',
  );
  await t.fixture.whenStable();
  await table.editing.save();
  await t.fixture.whenStable();
  expect(table.editing.session()).toBeNull();
  const currentRows = (t.renderer.value()['groups'] as JsonObject[])[0]!['rows'] as JsonObject[];
  expect(currentRows[0]!['name']).toBe('Native edited');
  expect(currentRows[0]!['note']).toBe('Keep A');
  expect(currentRows[1]).toBe(originalRows[1]);
  expect(table.issue()).toBeNull();
});

it('reuses the table projection for unrelated root edits and reports invalid native data explicitly', async () => {
  const t = await render();
  const node = t.fixture.debugElement.query(By.directive(HavenTableNode))
    .componentInstance as HavenTableNode;
  const projection = node.projectedRows();
  t.renderer.value.update((value) => ({ ...value, unrelated: 'Changed' }));
  await t.fixture.whenStable();
  expect(node.projectedRows()).toBe(projection);
  const groups = t.renderer.value()['groups'] as JsonObject[];
  const row = { id: 0, name: 'Still valid', invalid: undefined };
  t.renderer.value.set({
    groups: [{ ...groups[0]!, rows: [row as unknown as JsonObject] }, groups[1]!],
  });
  await t.fixture.whenStable();
  expect(node.projectedRows()).toBeNull();
  expect((t.fixture.nativeElement as HTMLElement).textContent).toContain('Invalid table rows');
  expect(node.table()).toBeUndefined();
});
