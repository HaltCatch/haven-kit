import type { HavenDocument, UiNode } from '@haven/schema';

export function empty(): HavenDocument {
  return {
    schemaVersion: '1.0',
    id: 'editing',
    title: 'Editing',
    dataSchema: { type: 'object', properties: {} },
    ui: group('root', 'form'),
    theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
    actions: {},
    resources: {},
  };
}
export function group(id: string, kind = 'layout.stack', children: UiNode[] = []): UiNode {
  return { id, kind, version: 1, children };
}
export function field(id: string): UiNode {
  return { id, kind: 'field.text', version: 1, bind: `/${id}`, props: { label: id } };
}
export function frozen<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}
