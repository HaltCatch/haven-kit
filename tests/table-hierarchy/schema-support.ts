import type { HavenDocument, JsonValue, TableHierarchy } from '@haven/schema';

export function model(hierarchy?: TableHierarchy): HavenDocument {
  return {
    schemaVersion: '1.0',
    id: 'tree-table',
    title: 'Local hierarchy',
    theme: { preset: 'material', mode: 'dark', density: 'compact' },
    dataSchema: {
      type: 'object',
      properties: {
        rows: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string' },
              parent: { type: 'string' },
              name: { type: 'string' },
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
        rowKey: '/key',
        columns: [
          { id: 'name', header: 'Name', path: '/name', type: 'text', editor: { id: 'text' } },
        ],
        ...(hierarchy ? { hierarchy: hierarchy as unknown as JsonValue } : {}),
      },
    },
    actions: {},
    resources: {},
  };
}
