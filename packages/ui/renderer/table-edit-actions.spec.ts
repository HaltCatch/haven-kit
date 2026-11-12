import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { afterEach, expect, it } from 'vitest';
import { HavenTable } from '@haven/ui/table';
import { ActionRegistry } from '@haven/runtime';
import type { ActionContext } from '@haven/runtime';
import type { HavenDocument, JsonObject } from '@haven/schema';
import { HavenRenderer } from './renderer';
import { setupTableEditTests } from '../../../tests/ui/table-edit-support';
afterEach(() => TestBed.resetTestingModule());
const document = (): HavenDocument => ({
  schemaVersion: '1.0',
  id: 'repeat-edit',
  title: 'Repeat edit',
  theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
  resources: {},
  actions: {},
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
                properties: { id: { type: 'number' }, name: { type: 'string' } },
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
          columns: [{ id: 'name', path: '/name', header: 'Name', editor: { id: 'text' } }],
        },
      },
    ],
  },
});
async function render() {
  setupTableEditTests();
  const doc = document();
  doc.actions = { read: { handler: 'test.run' }, write: { handler: 'test.run' } };
  doc.ui.children![0]!.props!['rowActions'] = [
    { id: 'write', label: 'Write row', kind: 'write', actions: ['write'] },
    { id: 'read', label: 'Read row', kind: 'read', actions: ['read'] },
  ];
  const contexts: ActionContext[] = [],
    done: (() => void)[] = [];
  const actions = new ActionRegistry();
  actions.register({
    id: 'test.run',
    execute: async (_input, context) => {
      contexts.push(context);
      await new Promise<void>((resolve) => done.push(resolve));
      return { status: 'success' };
    },
  });
  const f = TestBed.createComponent(HavenRenderer);
  f.componentRef.setInput('document', doc);
  f.componentRef.setInput('host', { actions });
  f.componentRef.setInput('value', { groups: [{ title: 'A', rows: [{ id: 0, name: 'A0' }] }] });
  await f.whenStable();
  const element = f.debugElement.query(By.directive(HavenTable)).nativeElement as HTMLElement;
  const button = (label: string) =>
    [...element.querySelectorAll<HTMLButtonElement>('haven-table-row-actions button')].find(
      (b) => b.textContent?.trim() === label,
    )!;
  const readonly = () => {
    const next = structuredClone(doc);
    next.ui.children![0]!.props!['readonly'] = true;
    f.componentRef.setInput('document', next);
  };
  return { f, contexts, done, button, readonly };
}
it('queued write action is stopped by same-tick readonly while read stays available', async () => {
  const t = await render();
  t.button('Write row').click();
  t.readonly();
  await t.f.whenStable();
  expect(t.contexts).toHaveLength(0);
  t.button('Read row').click();
  await t.f.whenStable();
  expect(t.contexts).toHaveLength(1);
  expect(((t.contexts[0]!.event as JsonObject)['value'] as JsonObject)['actionId']).toBe('read');
  t.done.forEach((done) => done());
  await t.f.whenStable();
});
it('readonly cancels only in-flight write row scope, preserving read action', async () => {
  const t = await render();
  t.button('Write row').click();
  t.button('Read row').click();
  await t.f.whenStable();
  expect(t.contexts).toHaveLength(2);
  const find = (id: string) =>
    t.contexts.find((c) => ((c.event as JsonObject)['value'] as JsonObject)['actionId'] === id)!;
  t.readonly();
  await t.f.whenStable();
  expect(find('write').signal.aborted).toBe(true);
  expect(find('read').signal.aborted).toBe(false);
  t.done.forEach((done) => done());
  await t.f.whenStable();
});
