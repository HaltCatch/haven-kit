import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { HavenDocument } from '@haven/schema';
import { HavenTable } from '@haven/ui/table';
import { HavenRenderer } from '../../renderer';
import { setupTableEditTests } from '../../../../../tests/ui/table-edit-support';

export function document(): HavenDocument {
  return {
    schemaVersion: '1.0',
    id: 'virtual-model',
    title: 'Virtual model',
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
            properties: { id: { type: 'number' }, name: { type: 'string' } },
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
        title: 'Records',
        rowKey: '/id',
        pageSize: 2,
        columns: [{ id: 'name', path: '/name', header: 'Name', editor: { id: 'text' } }],
        editMode: 'cell',
      },
    },
  };
}

export function create(model = document()) {
  setupTableEditTests();
  const fixture = TestBed.createComponent(HavenRenderer);
  fixture.componentRef.setInput('document', model);
  fixture.componentRef.setInput('value', {
    rows: Array.from({ length: 50 }, (_, id) => ({ id, name: `Row ${id}` })),
  });
  const table = () =>
    fixture.debugElement.query(By.directive(HavenTable)).componentInstance as HavenTable;
  return { fixture, model, renderer: fixture.componentInstance, table };
}
