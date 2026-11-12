import type { HavenDocument } from '@haven/schema';
export function document(): HavenDocument {
  return {
    schemaVersion: '1.0',
    id: 'example',
    title: 'Inputs',
    dataSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', maxLength: 80 },
        quantity: { type: 'number', minimum: 0 },
        enabled: { type: 'boolean' },
        rows: {
          type: 'array',
          items: { type: 'object', properties: { value: { type: 'string' } } },
        },
      },
      required: ['title'],
    },
    ui: {
      id: 'root',
      kind: 'form',
      version: 1,
      children: [
        { id: 'title', kind: 'field.text', version: 1, bind: '/title', props: { label: 'Title' } },
        { id: 'quantity', kind: 'field.number', version: 1, bind: '/quantity' },
      ],
    },
    theme: { preset: 'material', mode: 'system', density: 'comfortable' },
    actions: {},
    resources: {},
  };
}
