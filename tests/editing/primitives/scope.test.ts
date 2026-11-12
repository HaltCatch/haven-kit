import { describe, expect, it } from 'vitest';
import { validateDocument } from '@haven/schema';
import { HavenEditingError } from '../../../packages/runtime/src/editing/errors.js';
import { insertScopeProperty, sameDataScope } from '../../../packages/runtime/src/editing/scope.js';
import { moveNode } from '../../../packages/runtime/src/editing/tree.js';
import { empty, field, frozen, group } from './support.js';

describe('shared data scope primitives', () => {
  it('uses decoded repeat bindings instead of editable node IDs and rejects moves across item boundaries', () => {
    const document = empty();
    document.ui.children = [
      {
        ...group('repeat', 'form.repeat', [
          group('left', 'layout.stack', [
            field('name'),
            { id: 'action', kind: 'action.button', version: 1 },
          ]),
          group('right'),
        ]),
        bind: '/rows~1~0',
      },
      group('root-layout'),
    ];
    document.dataSchema.properties = {
      'rows/~': {
        type: 'array',
        items: { type: 'object', properties: { name: { type: 'string' } } },
      },
    };
    frozen(document);
    expect(sameDataScope(document, 'left', 'right')).toBe(true);
    expect(sameDataScope(document, 'left', 'root-layout')).toBe(false);
    expect(moveNode(document, 'name', 'right', 0).dataSchema).toBe(document.dataSchema);
    for (const id of ['name', 'action', 'left'])
      expect(() => moveNode(document, id, 'root-layout', 0)).toThrow(
        new HavenEditingError('editing.moveScope'),
      );
    // Moving the whole repeat retains its inner item context.
    expect(validateDocument(moveNode(document, 'repeat', 'root-layout', 0)).diagnostics).toEqual(
      [],
    );
  });

  it('enters nested repeats through layouts and never inserts into an adjacent object scope', () => {
    const document = empty();
    document.dataSchema.properties = {
      rows: {
        type: 'array',
        items: {
          type: 'object',
          properties: { children: { type: 'array', items: { type: 'object', properties: {} } } },
        },
      },
    };
    document.ui.children = [
      {
        ...group('rows', 'form.repeat', [
          { ...group('children', 'form.repeat', [group('layout')]), bind: '/children' },
        ]),
        bind: '/rows',
      },
    ];
    frozen(document);
    const changed = insertScopeProperty(document, 'layout', 'caption/~', { type: 'string' });
    expect(changed.properties!['rows']!.items!.properties!['children']!.items!.properties).toEqual({
      'caption/~': { type: 'string' },
    });
    expect(changed.properties!['rows']!.items!.properties!['caption/~']).toBeUndefined();
    expect(
      document.dataSchema.properties!['rows']!.items!.properties!['children']!.items!.properties,
    ).toEqual({});
  });

  it('materializes only referenced objects/arrays on the edited path while preserving shared definitions and constraints', () => {
    const document = empty();
    document.dataSchema.$defs = {
      row: { type: 'object', properties: { kept: { type: 'string' } }, required: ['kept'] },
      rows: { type: 'array', minItems: 1, items: { $ref: '#/$defs/row' } },
      group: { type: 'object', properties: { rows: { $ref: '#/$defs/rows' } } },
    };
    document.dataSchema.properties = {
      first: { $ref: '#/$defs/group' },
      second: { $ref: '#/$defs/group' },
    };
    document.ui.children = [{ ...group('repeat', 'form.repeat'), bind: '/first/rows' }];
    frozen(document);
    const changed = insertScopeProperty(document, 'repeat', 'amount', { type: 'number' });
    const array = changed.properties!['first']!.properties!['rows']!;
    expect(array.minItems).toBe(1);
    expect(array.items!.required).toEqual(['kept']);
    expect(array.items!.properties).toEqual({
      kept: { type: 'string' },
      amount: { type: 'number' },
    });
    expect(changed.$defs).toBe(document.dataSchema.$defs);
    expect(changed.properties!['second']).toBe(document.dataSchema.properties!['second']);
    expect(document.dataSchema.properties!['first']).toEqual({ $ref: '#/$defs/group' });
    expect(validateDocument({ ...document, dataSchema: changed }).diagnostics).toEqual([]);
  });

  it('retains root definitions while repairing a root-reference draft', () => {
    const document = empty();
    document.dataSchema = {
      $ref: '#/$defs/Root',
      $defs: {
        Root: { type: 'object', properties: { kept: { $ref: '#/$defs/Item' } } },
        Item: { type: 'string' },
      },
    };
    frozen(document);
    const changed = insertScopeProperty(document, 'root', 'caption', { type: 'string' });
    expect(changed.$defs).toBe(document.dataSchema.$defs);
    expect(changed.properties).toEqual({
      kept: { $ref: '#/$defs/Item' },
      caption: { type: 'string' },
    });
    expect(validateDocument({ ...document, dataSchema: changed }).diagnostics).toEqual([]);
  });

  it('rejects malformed or non-object item scopes, unsafe names and binding collisions without mutation', () => {
    for (const items of [
      { $ref: '#/$defs/missing' },
      { $ref: '#/$defs/cycle' },
      { type: 'string' as const },
    ]) {
      const document = empty();
      document.dataSchema.$defs = { cycle: { $ref: '#/$defs/cycle' } };
      document.dataSchema.properties = { rows: { type: 'array', items } };
      document.ui.children = [{ ...group('repeat', 'form.repeat'), bind: '/rows' }];
      frozen(document);
      expect(() => insertScopeProperty(document, 'repeat', 'name', { type: 'string' })).toThrow(
        new HavenEditingError('editing.editScope'),
      );
    }
    const document = empty();
    document.dataSchema.properties = { name: { type: 'number' } };
    frozen(document);
    expect(() => insertScopeProperty(document, 'root', '__proto__', { type: 'string' })).toThrow(
      new HavenEditingError('editing.editScope'),
    );
    expect(() => insertScopeProperty(document, 'root', 'name', { type: 'string' })).toThrow(
      new HavenEditingError('editing.bindingCollision'),
    );
    expect(() => sameDataScope(document, 'missing', 'root')).toThrow(
      new HavenEditingError('editing.moveTarget'),
    );
    expect(document.dataSchema.properties).toEqual({ name: { type: 'number' } });
  });
});
