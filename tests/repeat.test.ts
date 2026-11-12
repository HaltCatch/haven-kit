import { describe, it, expect } from 'vitest';
import { validateDocument } from '@haven/schema';
import type { HavenDocument } from '@haven/schema';
const model = (): HavenDocument => ({
  schemaVersion: '1.0',
  id: 'repeat',
  title: 'Repeat',
  dataSchema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      rows: {
        type: 'array',
        minItems: 1,
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            enabled: { type: 'boolean' },
            children: {
              type: 'array',
              items: { type: 'object', properties: { value: { type: 'number' } } },
            },
          },
          required: ['name'],
        },
      },
    },
  },
  ui: {
    id: 'rows',
    kind: 'form.repeat',
    version: 1,
    bind: '/rows',
    children: [
      {
        id: 'name',
        kind: 'field.text',
        version: 1,
        bind: '/name',
        rules: {
          disabled: {
            op: 'eq',
            left: { scope: 'item', path: '/enabled' },
            right: { literal: false },
          },
        },
      },
      {
        id: 'children',
        kind: 'form.repeat',
        version: 1,
        bind: '/children',
        children: [{ id: 'value', kind: 'field.number', version: 1, bind: '/value' }],
      },
    ],
  },
  theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
  resources: {},
  actions: {},
});
describe('repeat model scopes', () => {
  it('validates nested object arrays, item bindings and rules independently of root data', () => {
    expect(validateDocument(model()).diagnostics).toEqual([]);
  });
  it('rejects a child binding accidentally aimed at the document root', () => {
    const doc = model();
    doc.ui.children![0]!.bind = '/title';
    expect(validateDocument(doc).diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'binding.path', nodeId: 'name' })]),
    );
  });
  it('rejects unsupported scalar rows without coercing their data model', () => {
    const doc = model();
    doc.dataSchema.properties!['rows']!.items = { type: 'string' };
    expect(validateDocument(doc).diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'repeat.items' })]),
    );
  });
  it('does not persist synthetic identity fields or accept the old unimplemented itemKey placeholder', () => {
    const doc = model();
    doc.ui.props = { itemKey: '/name' };
    expect(validateDocument(doc).diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'property.unknown' })]),
    );
  });
});
