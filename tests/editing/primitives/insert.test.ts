import { describe, expect, it } from 'vitest';
import { validateDocument } from '@haven/schema';
import { HavenEditingError } from '../../../packages/runtime/src/editing/errors.js';
import { insertNode } from '../../../packages/runtime/src/editing/insert.js';
import { empty, field, frozen, group } from './support.js';

describe('resolved node insertion', () => {
  it('uses a stable direct sibling anchor, accepts an already resolved subtree and preserves all its metadata', () => {
    const document = empty();
    document.ui.children = [group('last')];
    const node = group('new', 'layout.section', [field('nested')]);
    node.props = { title: { default: 'Group', translations: { 'fr-FR': 'Groupe' } } };
    frozen(document);
    frozen(node);
    const inserted = insertNode(document, 'root', 'last', node);
    expect(inserted.ui.children).toEqual([node, document.ui.children[0]]);
    expect(inserted.ui.children![0]).toBe(node);
    expect(inserted.dataSchema).toBe(document.dataSchema);
    expect(insertNode(inserted, 'root', null, group('end')).ui.children?.at(-1)?.id).toBe('end');
    expect(document.ui.children.map((child) => child.id)).toEqual(['last']);
  });

  it('inserts the optional factory schema into the actual repeat scope and merges named resources', () => {
    const document = empty();
    document.dataSchema.properties = {
      rows: { type: 'array', items: { type: 'object', properties: {} } },
    };
    document.ui.children = [
      { ...group('repeat', 'form.repeat', [group('layout')]), bind: '/rows' },
    ];
    const resources = { choices: { type: 'options' as const, adapter: 'host.choices' } };
    frozen(document);
    frozen(resources);
    const inserted = insertNode(document, 'layout', null, field('name'), {
      schema: { type: 'string' },
      resources,
    });
    expect(inserted.dataSchema.properties!['rows']!.items!.properties).toEqual({
      name: { type: 'string' },
    });
    expect(inserted.dataSchema.properties!['name']).toBeUndefined();
    expect(inserted.resources['choices']).toBe(resources.choices);
    expect(validateDocument(inserted).diagnostics).toEqual([]);
    expect(document.dataSchema.properties!['rows']!.items!.properties).toEqual({});
  });

  it('rejects duplicate subtree identities, bad parents/anchors and binding/resource collisions atomically', () => {
    const document = empty();
    document.ui.children = [group('existing', 'layout.stack', [group('nested')]), field('leaf')];
    document.dataSchema.properties = { name: { type: 'number' } };
    document.resources = { source: { type: 'options', adapter: 'host.original' } };
    const before = structuredClone(document);
    const calls = [
      () => insertNode(document, 'root', null, group('existing')),
      () => insertNode(document, 'root', null, group('new', 'layout.stack', [group('nested')])),
      () =>
        insertNode(
          document,
          'root',
          null,
          group('new', 'layout.stack', [group('twice'), group('twice')]),
        ),
    ];
    for (const call of calls) expect(call).toThrow(new HavenEditingError('editing.duplicateNode'));
    expect(() => insertNode(document, 'missing', null, group('new'))).toThrow(
      new HavenEditingError('editing.moveTarget'),
    );
    expect(() => insertNode(document, 'leaf', null, group('new'))).toThrow(
      new HavenEditingError('editing.notContainer'),
    );
    expect(() => insertNode(document, 'root', 'nested', group('new'))).toThrow(
      new HavenEditingError('editing.position'),
    );
    expect(() =>
      insertNode(document, 'root', null, field('name'), { schema: { type: 'string' } }),
    ).toThrow(new HavenEditingError('editing.bindingCollision'));
    expect(() =>
      insertNode(document, 'root', null, group('new'), {
        resources: { source: { type: 'options', adapter: 'host.other' } },
      }),
    ).toThrow(new HavenEditingError('editing.resourceCollision'));
    expect(document).toEqual(before);
  });
});
