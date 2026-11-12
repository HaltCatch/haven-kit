import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { provideHavenTransloco } from '@haven/ui/i18n';
import english from '@haven/ui/i18n/locales/en-US.json';
import { HavenTable } from '@haven/ui/table';
import { ActionRegistry } from '@haven/runtime';
import type { ActionContext } from '@haven/runtime';
import type { HavenDocument } from '@haven/schema';
import { afterEach, expect, it } from 'vitest';
import { HavenRenderer } from './renderer';

afterEach(() => TestBed.resetTestingModule());

it('passes a typed immutable table selection to its selection, filter and view actions', async () => {
  TestBed.configureTestingModule({
    providers: [
      provideTransloco({
        config: { defaultLang: 'en-US', availableLangs: ['en-US'], prodMode: true },
      }),
      provideHavenTransloco(),
    ],
  });
  TestBed.inject(TranslocoService).setTranslation({ haven: english }, 'en-US');
  const contexts: ActionContext[] = [];
  const actions = new ActionRegistry();
  actions.register({
    id: 'test.table',
    execute: async (_input, context) => {
      contexts.push(context);
      return { status: 'success' };
    },
  });
  const document: HavenDocument = {
    schemaVersion: '1.0',
    id: 'table-actions',
    title: 'Table actions',
    dataSchema: {
      type: 'object',
      properties: {
        rows: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'number' }, name: { type: 'string' } },
          },
        },
      },
    },
    ui: {
      id: 'table',
      kind: 'table',
      version: 1,
      bind: '/rows',
      props: {
        rowKey: '/id',
        filterable: true,
        selectable: true,
        columnMenu: true,
        columns: [{ id: 'name', header: 'Name', path: '/name', type: 'text' }],
      },
      events: { selectionChange: ['run'], filterChange: ['run'], viewChange: ['run'] },
    },
    actions: { run: { handler: 'test.table' } },
    resources: {},
    theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
  };
  const fixture = TestBed.createComponent(HavenRenderer);
  fixture.componentRef.setInput('document', document);
  fixture.componentRef.setInput('host', { actions });
  fixture.componentRef.setInput('value', {
    rows: [
      { id: 0, name: 'First' },
      { id: 1, name: 'Second' },
    ],
  });
  await fixture.whenStable();
  (fixture.nativeElement as HTMLElement)
    .querySelector<HTMLInputElement>('tbody input[type="checkbox"]')!
    .click();
  await expect.poll(() => contexts.length).toBe(1);
  expect(contexts[0]!.selection).toEqual([0]);
  expect(Object.isFrozen(contexts[0]!.selection)).toBe(true);
  const filter = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
    'input[type="search"]',
  )!;
  filter.value = 'First';
  filter.dispatchEvent(new Event('input', { bubbles: true }));
  await expect.poll(() => contexts.length).toBe(2);
  expect(contexts[1]!.selection).toEqual([0]);
  const table = fixture.debugElement.query(By.directive(HavenTable))
    .componentInstance as HavenTable;
  table.table.getColumn('name')!.pin('start');
  await expect.poll(() => contexts.length).toBe(3);
  expect(contexts[2]!.selection).toEqual([0]);
  table.table.toggleAllRowsSelected(false);
  await expect.poll(() => contexts.length).toBe(4);
  expect(contexts[3]!.selection).toEqual([]);
  expect(contexts[0]!.selection).toEqual([0]);
});
