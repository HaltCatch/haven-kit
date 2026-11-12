import { describe, expect, it } from 'vitest';
import {
  replaceDataSchema,
  setProperty,
  setRequired,
} from '../../../packages/runtime/src/editing/properties.js';
import { empty, field, frozen } from './support.js';

describe('shared property primitives', () => {
  it('retains untouched localized and unexposed JSON metadata, validators and events', () => {
    const document = empty(),
      node = field('name');
    node.props = {
      label: { default: 'Name', translations: { 'en-US': 'Name', 'fr-FR': 'Nom' } },
      description: 'Old',
      metadata: { nested: ['Retain unexposed data'] },
    };
    node.events = { change: ['changed'] };
    node.validators = [
      {
        id: 'unchanged',
        type: 'compare',
        operator: 'eq',
        message: 'Keep',
        other: { scope: 'root', path: '/other' },
      },
    ];
    document.ui.children = [node];
    document.actions = {
      changed: { handler: 'host.changed', input: { value: { scope: 'event', path: '/value' } } },
    };
    frozen(document);
    const changed = setProperty(document, 'name', 'description', 'New');
    expect(changed.ui.children![0]!.props).toEqual({ ...node.props, description: 'New' });
    expect(changed.ui.children![0]!.props!['label']).toBe(node.props['label']);
    expect(changed.ui.children![0]!.props!['metadata']).toBe(node.props['metadata']);
    expect(changed.ui.children![0]!.events).toBe(node.events);
    expect(changed.ui.children![0]!.validators).toBe(node.validators);
    expect(changed.actions).toBe(document.actions);
    expect(node.props['description']).toBe('Old');
  });

  it('changes required without discarding visible/disabled rules or touching source schemas', () => {
    const document = empty(),
      node = field('name');
    node.rules = {
      visible: { op: 'eq', left: { literal: true }, right: { literal: true } },
      disabled: { op: 'eq', left: { literal: false }, right: { literal: true } },
    };
    document.ui.children = [node];
    frozen(document);
    const changed = setRequired(document, 'name', false);
    expect(changed.ui.children![0]!.rules).toEqual({
      ...node.rules,
      required: { op: 'eq', left: { literal: false }, right: { literal: true } },
    });
    expect(changed.dataSchema).toBe(document.dataSchema);
    expect(node.rules).not.toHaveProperty('required');
  });

  it('replaces only the explicit schema and leaves all other document configuration untouched', () => {
    const document = frozen(empty());
    const dataSchema = frozen({
      type: 'object' as const,
      properties: { name: { type: 'string' as const } },
    });
    const changed = replaceDataSchema(document, dataSchema);
    expect(changed).toEqual({ ...document, dataSchema });
    expect(changed.dataSchema).toBe(dataSchema);
    expect(changed.ui).toBe(document.ui);
    expect(document.dataSchema.properties).toEqual({});
  });
});
