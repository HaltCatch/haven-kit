import { describe, expect, it } from 'vitest';
import { applyEditingBatch } from '@haven/runtime/editing';
import { group, frozen } from '../primitives/support.js';
import { batch, state } from './support.js';

describe('transaction owners and stable locations', () => {
  it.each([{ documentId: 'other-document' }, { sessionId: 'other-session' }, { editRevision: 6 }])(
    'rejects stale document, session or local edit revision: %j',
    (override) => {
      const source = frozen(state()),
        input = batch([
          {
            type: 'document.patch',
            patch: [{ op: 'replace', path: '/title', value: 'Never applied' }],
          },
        ]);
      Object.assign(input.expected, override);
      expect(applyEditingBatch(source, input)).toMatchObject({
        ok: false,
        diagnostics: [{ code: 'editing.conflict', path: '/expected' }],
      });
      expect(source.document.title).toBe('Editing');
    },
  );

  it('repositions stable IDs against the staged direct siblings and treats a same-parent self anchor as a no-op', () => {
    const source = state();
    source.document.ui.children = [group('a'), group('b'), group('c')];
    const moved = applyEditingBatch(
      source,
      batch(
        [
          { type: 'node.insert', parentId: 'root', beforeId: 'c', node: group('new') },
          { type: 'node.move', nodeId: 'a', parentId: 'root', beforeId: 'c' },
        ],
        source,
      ),
    );
    expect(moved.ok).toBe(true);
    if (!moved.ok) throw new Error(JSON.stringify(moved.diagnostics));
    expect(moved.document.ui.children!.map((node) => node.id)).toEqual(['b', 'new', 'a', 'c']);
    const unchanged = applyEditingBatch(
      source,
      batch([{ type: 'node.move', nodeId: 'a', parentId: 'root', beforeId: 'a' }], source),
    );
    expect(unchanged).toMatchObject({ ok: true, changes: [], editRevision: 7 });
  });

  it('rejects missing nodes and non-direct anchors rather than silently clamping external commands', () => {
    const source = state();
    source.document.ui.children = [
      group('group', 'layout.stack', [group('nested')]),
      group('other'),
    ];
    for (const type of ['node.remove', 'node.patch'] as const) {
      const command =
        type === 'node.patch'
          ? { type, nodeId: 'missing', patch: [{ op: 'add' as const, path: '/props', value: {} }] }
          : { type, nodeId: 'missing' };
      expect(applyEditingBatch(source, batch([command], source))).toMatchObject({
        ok: false,
        diagnostics: [{ code: 'editing.missingNode' }],
      });
    }
    expect(
      applyEditingBatch(
        source,
        batch(
          [{ type: 'node.move', nodeId: 'other', parentId: 'root', beforeId: 'nested' }],
          source,
        ),
      ),
    ).toMatchObject({ ok: false, diagnostics: [{ code: 'editing.position' }] });
    expect(
      applyEditingBatch(
        source,
        batch(
          [{ type: 'node.move', nodeId: 'nested', parentId: 'other', beforeId: 'nested' }],
          source,
        ),
      ),
    ).toMatchObject({ ok: false, diagnostics: [{ code: 'editing.position' }] });
  });

  it('refuses revision exhaustion instead of producing an unsafe counter', () => {
    const source = { ...state(), editRevision: Number.MAX_SAFE_INTEGER };
    const result = applyEditingBatch(
      source,
      batch(
        [{ type: 'document.patch', patch: [{ op: 'test', path: '/title', value: 'Editing' }] }],
        source,
      ),
    );
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: 'editing.revision' }] });
  });
});
