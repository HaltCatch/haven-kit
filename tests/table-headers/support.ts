import type { HavenDocument, JsonValue, TableColumn } from '@haven/schema';

export const columns: TableColumn[] = [
  { id: 'name', header: 'Name', path: '/name', type: 'text' },
  { id: 'amount', header: 'Amount', path: '/amount', type: 'number' },
];
export function document(headerGroups?: JsonValue): HavenDocument {
  return {
    schemaVersion: '1.0',
    id: 'grouped-headers',
    title: 'Grouped headers',
    theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
    dataSchema: {
      type: 'object',
      properties: {
        rows: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              amount: { type: 'number' },
            },
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
        columns: columns as unknown as JsonValue,
        rowKey: '/id',
        ...(headerGroups === undefined ? {} : { headerGroups }),
      },
    },
    actions: {},
    resources: {},
  };
}
