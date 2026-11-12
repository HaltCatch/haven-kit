import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { provideHavenTransloco } from '@haven/ui/i18n';
import english from '@haven/ui/i18n/locales/en-US.json';
import { HavenTable } from '@haven/ui/table';
import { ActionRegistry } from '@haven/runtime';
import type {
  ActionContext,
  TableDataAdapter,
  TableDataPage,
  TableDataRequest,
} from '@haven/runtime';
import type { HavenDocument } from '@haven/schema';
import { readPointer } from '@haven/schema';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { HavenRenderer } from './renderer';

beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [
      provideTransloco({
        config: { defaultLang: 'en-US', availableLangs: ['en-US'], prodMode: true },
      }),
      provideHavenTransloco(),
    ],
  });
  TestBed.inject(TranslocoService).setTranslation({ haven: english }, 'en-US');
});
afterEach(() => TestBed.resetTestingModule());
function document(): HavenDocument {
  return {
    schemaVersion: '1.0',
    id: 'remote-table-page',
    title: 'Remote table',
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
        resource: 'records',
        pageSize: 2,
        selectable: true,
        filterable: true,
        columns: [{ id: 'name', path: '/name', header: 'Name', type: 'text' }],
      },
      events: { queryChange: ['observe'] },
    },
    actions: { observe: { handler: 'test.observe' } },
    resources: { records: { type: 'query', adapter: 'records.load' } },
    theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
  };
}
function pending() {
  const calls: { request: TableDataRequest; resolve: (page: TableDataPage) => void }[] = [];
  const adapter: TableDataAdapter = {
    load: (request) => new Promise((resolve) => calls.push({ request, resolve })),
  };
  return { calls, adapter };
}
it('requires a configured named query adapter and never renders bound data as a remote fallback', async () => {
  const fixture = TestBed.createComponent(HavenRenderer);
  fixture.componentRef.setInput('document', document());
  fixture.componentRef.setInput('value', { rows: [{ id: 99, name: 'Not remote data' }] });
  await fixture.whenStable();
  expect(fixture.componentInstance.validation().valid).toBe(true);
  expect(fixture.debugElement.query(By.directive(HavenTable))).toBeNull();
  expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).not.toBeNull();
  expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Not remote data');
});
it('routes query events with selection while remote rows stay out of form data and cancels an old owner', async () => {
  const { calls, adapter } = pending();
  const contexts: ActionContext[] = [];
  const actions = new ActionRegistry();
  actions.register({
    id: 'test.observe',
    execute: async (_input, context) => {
      contexts.push(context);
      return { status: 'success' };
    },
  });
  const fixture = TestBed.createComponent(HavenRenderer);
  const host = { actions, tables: new Map([['records.load', adapter]]), revision: 'first' };
  fixture.componentRef.setInput('document', document());
  fixture.componentRef.setInput('host', host);
  fixture.componentRef.setInput('value', { rows: [] });
  await fixture.whenStable();
  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0]!.request.pageSize).toBe(2);
  calls[0]!.resolve({
    rows: [
      { id: 0, name: 'Zero' },
      { id: 1, name: 'One' },
    ],
    total: 4,
  });
  await fixture.whenStable();
  const table = fixture.debugElement.query(By.directive(HavenTable))
    .componentInstance as HavenTable;
  await expect.poll(() => table.dataState().status).toBe('ready');
  await fixture.whenStable();
  table.table.getRow('number:0').toggleSelected(true);
  await fixture.whenStable();
  table.table.nextPage();
  await fixture.whenStable();
  await expect.poll(() => calls.length).toBe(2);
  await expect.poll(() => contexts.length).toBeGreaterThan(0);
  expect(contexts.at(-1)!.selection).toEqual([0]);
  expect(readPointer(contexts.at(-1)!.event, '/value')).toMatchObject({
    pageIndex: 1,
    pageSize: 2,
  });
  expect(fixture.componentInstance.value()).toEqual({ rows: [] });
  fixture.componentRef.setInput('host', { ...host, revision: 'second' });
  await fixture.whenStable();
  expect(calls[1]!.request.signal.aborted).toBe(true);
  await expect.poll(() => calls.length).toBe(3);
  calls[1]!.resolve({
    rows: [
      { id: 2, name: 'Stale' },
      { id: 3, name: 'Stale too' },
    ],
    total: 4,
  });
  calls[2]!.resolve({ rows: [{ id: 7, name: 'Current' }], total: 1 });
  await fixture.whenStable();
  const currentTable = fixture.debugElement.query(By.directive(HavenTable))
    .componentInstance as HavenTable;
  await expect.poll(() => currentTable.dataState().status).toBe('ready');
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  expect(root.textContent).toContain('Current');
  expect(root.textContent).not.toContain('Stale');
  const replacement = fixture.debugElement.query(By.directive(HavenTable))
    .componentInstance as HavenTable;
  expect(replacement.selection()).toEqual([]);
  expect(replacement.query().pageIndex).toBe(0);
});
