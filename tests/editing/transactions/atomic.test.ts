import { describe, expect, it } from 'vitest';
import { applyEditingBatch } from '@haven/runtime/editing';
import { field, frozen, group } from '../primitives/support.js';
import { batch, state } from './support.js';

describe('atomic shared document transactions', () => {
  it('stages a whole batch and increments its revision once, preserving frozen callers and command inputs', () => {
    const source = state();
    source.document.ui.children = [group('destination')];
    const commands = batch(
      [
        { type: 'document.patch', patch: [{ op: 'replace', path: '/title', value: 'Changed' }] },
        {
          type: 'node.insert',
          parentId: 'root',
          beforeId: 'destination',
          node: field('name'),
          defaults: { schema: { type: 'string' } },
        },
        { type: 'node.move', nodeId: 'name', parentId: 'destination', beforeId: null },
        {
          type: 'node.patch',
          nodeId: 'name',
          patch: [{ op: 'replace', path: '/props/label', value: 'New name' }],
        },
      ],
      source,
    );
    const before = structuredClone(source),
      input = structuredClone(commands);
    frozen(source);
    frozen(commands);
    const result = applyEditingBatch(source, commands, { requireValid: true });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.editRevision).toBe(8);
    expect(result.operationId).toBe(commands.operationId);
    expect(result.document.title).toBe('Changed');
    expect(result.document.ui.children![0]!.children![0]!.props!['label']).toBe('New name');
    expect(result.validation.valid).toBe(true);
    expect(source).toEqual(before);
    expect(commands).toEqual(input);
    expect(result.document).not.toBe(source.document);
  });

  it('rolls back both preceding commands and mutations preceding a failing RFC test', () => {
    const source = frozen(state()),
      before = structuredClone(source);
    const result = applyEditingBatch(
      source,
      batch([
        { type: 'document.patch', patch: [{ op: 'replace', path: '/title', value: 'Staged' }] },
        {
          type: 'document.patch',
          patch: [
            { op: 'replace', path: '/title', value: 'Also staged' },
            { op: 'test', path: '/title', value: 'Wrong precondition' },
          ],
        },
      ]),
    );
    expect(result).toMatchObject({
      ok: false,
      commandIndex: 1,
      diagnostics: [{ code: 'editing.patch', path: '/commands/1' }],
    });
    expect(result).not.toHaveProperty('document');
    expect(source).toEqual(before);
  });

  it('allows incomplete semantic drafts but requireValid rejects them without changing the baseline', () => {
    const source = state();
    source.document.ui.children = [field('unbound')];
    const edit = frozen(
      batch(
        [
          {
            type: 'document.patch',
            patch: [{ op: 'replace', path: '/title', value: 'Draft remains editable' }],
          },
        ],
        source,
      ),
    );
    const draft = applyEditingBatch(source, edit);
    expect(draft.ok).toBe(true);
    if (!draft.ok) throw new Error('Draft was rejected');
    expect(draft.validation.structural).toBe(true);
    expect(draft.validation.valid).toBe(false);
    expect(draft.validation.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'binding.path', nodeId: 'unbound' }),
    );
    const strict = applyEditingBatch(source, edit, { requireValid: true });
    expect(strict.ok).toBe(false);
    expect(strict).not.toHaveProperty('document');
    expect(source.document.title).toBe('Editing');
  });

  it('validates the final semantic state, permitting a field and its schema to be created in one transaction', () => {
    const source = state();
    const result = applyEditingBatch(
      source,
      batch([
        { type: 'node.insert', parentId: 'root', beforeId: null, node: field('name') },
        {
          type: 'document.patch',
          patch: [{ op: 'add', path: '/dataSchema/properties/name', value: { type: 'string' } }],
        },
      ]),
      { requireValid: true },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.validation.diagnostics).toEqual([]);
    expect(result.document.dataSchema.properties!['name']).toEqual({ type: 'string' });
  });
});
