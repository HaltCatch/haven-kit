import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { HavenDocument, JsonObject } from '@haven/schema';
import { HavenTable } from '@haven/ui/table';
import { HavenRenderer } from '../../renderer';
import { setupTableEditTests } from '../../../../../tests/ui/table-edit-support';

export function hierarchyDocument(): HavenDocument {
  return {
    schemaVersion: '1.0',
    id: 'hierarchy-model',
    title: 'Hierarchy model',
    theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
    actions: {},
    resources: {},
    dataSchema: {
      type: 'object',
      properties: {
        rows: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              parent: { type: 'number' },
              name: { type: 'string' },
              note: { type: 'string' },
            },
          },
        },
      },
    },
    ui: {
      id: 'records',
      kind: 'table',
      version: 1,
      bind: '/rows',
      props: {
        rowKey: '/id',
        hierarchy: { parentPath: '/parent', rootValue: null },
        expandedRowKeys: [0],
        editMode: 'cell',
        columns: [
          { id: 'name', header: 'Name', path: '/name', editor: { id: 'text' } },
          { id: 'note', header: 'Note', path: '/note' },
        ],
      },
    },
  };
}

export async function renderHierarchy() {
  setupTableEditTests();
  const fixture = TestBed.createComponent(HavenRenderer),
    renderer = fixture.componentInstance,
    document = hierarchyDocument();
  const rows: JsonObject[] = [
    { id: 1, parent: 0, name: 'Child', note: 'Original' },
    { id: 0, parent: null, name: 'Root', note: 'Root note' },
  ];
  fixture.componentRef.setInput('document', document);
  fixture.componentRef.setInput('value', { rows });
  await fixture.whenStable();
  const table = fixture.debugElement.query(By.directive(HavenTable))
    .componentInstance as HavenTable;
  return {
    fixture,
    renderer,
    document,
    rows,
    table,
    element: fixture.nativeElement as HTMLElement,
  };
}
