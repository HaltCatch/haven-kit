import { describe, expect, it } from 'vitest';
import { applyEditingBatch } from '@haven/runtime/editing';
import { batch, state } from './support.js';

describe('RFC array indexes and own-member traversal', () => {
  it.each([
    { path: '/dataSchema/required/length', value: 2 },
    { path: '/dataSchema/required/01', value: 'b' },
    { path: '/dataSchema/required/1.0', value: 'b' },
  ])(
    'rejects non-JSON array members and noncanonical indexes during test: $path',
    ({ path, value }) => {
      const source = state();
      source.document.dataSchema = {
        type: 'object',
        properties: { a: { type: 'string' }, b: { type: 'string' } },
        required: ['a', 'b'],
      };
      const result = applyEditingBatch(
        source,
        batch([{ type: 'document.patch', patch: [{ op: 'test', path, value }] }], source),
      );
      expect(result).toMatchObject({ ok: false, diagnostics: [{ code: 'editing.patch' }] });
      expect(
        applyEditingBatch(
          source,
          batch(
            [
              {
                type: 'document.patch',
                patch: [{ op: 'test', path: '/dataSchema/required/1', value: 'b' }],
              },
            ],
            source,
          ),
        ).ok,
      ).toBe(true);
    },
  );

  it('rejects traversal through inherited object members without modifying shared prototype functions', () => {
    const source = state();
    source.document.ui.props = {};
    const inherited = Object.prototype.toString;
    const before = Object.getOwnPropertyDescriptor(inherited, 'sentinel');
    try {
      const result = applyEditingBatch(
        source,
        batch(
          [
            {
              type: 'node.patch',
              nodeId: 'root',
              patch: [{ op: 'add', path: '/props/toString/sentinel', value: 'never write' }],
            },
          ],
          source,
        ),
      );
      expect(result).toMatchObject({ ok: false, diagnostics: [{ code: 'editing.patch' }] });
      expect(Object.getOwnPropertyDescriptor(inherited, 'sentinel')).toEqual(before);
      expect(Object.prototype.toString).toBe(inherited);
      expect(source.document.ui.props).toEqual({});
    } finally {
      if (before) Object.defineProperty(inherited, 'sentinel', before);
      else Reflect.deleteProperty(inherited, 'sentinel');
    }
  });
  it('checks an array move destination after removing its source instead of accepting splice clamping', () => {
    const source = state();
    source.document.dataSchema = {
      type: 'object',
      properties: { a: { type: 'string' }, b: { type: 'string' }, c: { type: 'string' } },
      required: ['a', 'b', 'c'],
    };
    const moving = (path: string) =>
      batch(
        [{ type: 'document.patch', patch: [{ op: 'move', from: '/dataSchema/required/0', path }] }],
        source,
      );
    expect(
      applyEditingBatch(source, moving('/dataSchema/required/3'), { requireValid: true }).ok,
    ).toBe(false);
    for (const path of ['/dataSchema/required/2', '/dataSchema/required/-']) {
      const result = applyEditingBatch(source, moving(path), { requireValid: true });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
      expect(result.document.dataSchema.required).toEqual(['b', 'c', 'a']);
    }
    expect(source.document.dataSchema.required).toEqual(['a', 'b', 'c']);
  });
  it('resolves a move destination in the post-removal tree, including shifted ancestors', () => {
    const source = state();
    source.document.ui.props = { items: [{ thing: 'moved' }, null, {}] };
    const result = applyEditingBatch(
      source,
      batch(
        [
          {
            type: 'node.patch',
            nodeId: 'root',
            patch: [{ op: 'move', from: '/props/items/0', path: '/props/items/1/item' }],
          },
        ],
        source,
      ),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.document.ui.props!['items']).toEqual([null, { item: { thing: 'moved' } }]);
    source.document.ui.props = { items: [{ child: {} }, { child: {} }] };
    const invalid = applyEditingBatch(
      source,
      batch(
        [
          {
            type: 'node.patch',
            nodeId: 'root',
            patch: [{ op: 'move', from: '/props/items/0', path: '/props/items/0/child/item' }],
          },
        ],
        source,
      ),
    );
    expect(invalid.ok).toBe(false);
    expect(source.document.ui.props).toEqual({ items: [{ child: {} }, { child: {} }] });
  });
});
