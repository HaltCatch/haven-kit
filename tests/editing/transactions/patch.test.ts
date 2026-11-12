import { describe, expect, it } from 'vitest';
import { applyEditingBatch } from '@haven/runtime/editing';
import type { EditingPatch } from '@haven/schema/editing';
import { field, frozen } from '../primitives/support.js';
import { batch, state } from './support.js';

describe('bounded RFC patch surface', () => {
  it('supports RFC test, copy and move semantics without modifying the source', () => {
    const source = state(),
      node = field('name');
    node.props = { label: 'Name', description: 'Old', placeholder: 'Hint' };
    source.document.ui.children = [node];
    source.document.dataSchema.properties = { name: { type: 'string' } };
    frozen(source);
    const result = applyEditingBatch(
      source,
      batch(
        [
          {
            type: 'node.patch',
            nodeId: 'name',
            patch: [
              { op: 'test', path: '/props', value: node.props },
              { op: 'copy', from: '/props/label', path: '/props/description' },
              { op: 'test', path: '/props/description', value: 'Name' },
              { op: 'move', from: '/props/placeholder', path: '/props/description' },
            ],
          },
        ],
        source,
      ),
      { requireValid: true },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.document.ui.children![0]!.props).toEqual({ label: 'Name', description: 'Hint' });
    expect(node.props).toEqual({ label: 'Name', description: 'Old', placeholder: 'Hint' });
  });

  it('compares a legitimate schema dictionary whose own property is named hasOwnProperty', () => {
    const source = state();
    source.document.dataSchema.properties = { hasOwnProperty: { type: 'string' as const } };
    const result = applyEditingBatch(
      source,
      batch(
        [
          {
            type: 'document.patch',
            patch: [
              {
                op: 'test',
                path: '/dataSchema/properties',
                value: { hasOwnProperty: { type: 'string' } },
              },
            ],
          },
        ],
        source,
      ),
      { requireValid: true },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.changes).toEqual([]);
    expect(result.editRevision).toBe(source.editRevision);
  });

  it.each<EditingPatch>([
    { op: 'replace', path: '', value: {} },
    { op: 'replace', path: '/id', value: 'renamed' },
    { op: 'replace', path: '/ui/children', value: [] },
    { op: 'copy', from: '/ui', path: '/theme' },
    { op: 'move', from: '/id', path: '/title' },
    { op: 'add', path: '/theme/tokens/__proto__', value: 'polluted' },
    { op: 'add', path: '/dataSchema/properties/constructor', value: { type: 'string' } },
  ])(
    'rejects document identity, tree bypasses and unsafe source/destination paths: %#',
    (patch) => {
      const source = frozen(state());
      const result = applyEditingBatch(source, batch([{ type: 'document.patch', patch: [patch] }]));
      expect(result).toMatchObject({ ok: false, diagnostics: [{ code: 'editing.patchPath' }] });
      expect(source.document.id).toBe('editing');
    },
  );

  it.each<EditingPatch>([
    { op: 'replace', path: '/id', value: 'other' },
    { op: 'add', path: '/children/-', value: {} },
    { op: 'copy', from: '/children', path: '/props' },
    { op: 'move', from: '/kind', path: '/props/description' },
  ])('rejects node identity and children changes through patches: %#', (patch) => {
    const result = applyEditingBatch(
      state(),
      batch([{ type: 'node.patch', nodeId: 'root', patch: [patch] }]),
    );
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: 'editing.patchPath' }] });
  });

  it('addresses escaped literal property names without interpreting slashes or tildes as extra segments', () => {
    const source = state();
    const result = applyEditingBatch(
      source,
      batch([
        {
          type: 'document.patch',
          patch: [
            { op: 'add', path: '/dataSchema/properties/a~1b~0', value: { type: 'string' } },
            { op: 'test', path: '/dataSchema/properties/a~1b~0', value: { type: 'string' } },
          ],
        },
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.document.dataSchema.properties!['a/b~']).toEqual({ type: 'string' });
  });
});
