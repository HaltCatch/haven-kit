import type { HavenDocument } from '@haven/schema';

export function model(): HavenDocument {
  return {
    schemaVersion: '1.0',
    id: 'guard-audit',
    title: 'Guard audit',
    dataSchema: { type: 'object', properties: { value: { type: 'string' } } },
    theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
    ui: { id: 'root', kind: 'form', version: 1, children: [] },
    actions: {},
    resources: {},
  };
}
