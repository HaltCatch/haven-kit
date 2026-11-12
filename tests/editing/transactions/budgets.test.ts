import { describe, expect, it } from 'vitest';
import { captureEditingBatch } from '@haven/schema/editing';
import type { EditingCommand, EditingPatch } from '@haven/schema/editing';
import { applyEditingBatch } from '@haven/runtime/editing';
import { batch, state } from './support.js';
import { group } from '../primitives/support.js';

const testTitle = (): EditingPatch => ({ op: 'test', path: '/title', value: 'Editing' });
const patchCommand = (count: number): EditingCommand => ({
  type: 'document.patch',
  patch: Array.from({ length: count }, testTitle),
});

describe('bounded editing batches', () => {
  it('allows 512 total patch operations but rejects 513 across otherwise valid command groups', () => {
    const exact = batch(Array.from({ length: 8 }, () => patchCommand(64)));
    expect(captureEditingBatch(exact).ok).toBe(true);
    expect(applyEditingBatch(state(), exact)).toMatchObject({
      ok: true,
      changes: [],
      editRevision: 7,
    });
    const tooMany = batch([...exact.commands, patchCommand(1)]);
    expect(captureEditingBatch(tooMany)).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'editing.limit', path: '/commands' }],
    });
  });

  it('enforces command count, per-command patch count, operation IDs and physical JSON bytes', () => {
    expect(captureEditingBatch(batch(Array.from({ length: 128 }, () => patchCommand(1)))).ok).toBe(
      true,
    );
    for (const input of [
      batch(Array.from({ length: 129 }, () => patchCommand(1))),
      batch([patchCommand(65)]),
      batch([]),
      batch([patchCommand(0)]),
      { ...batch([patchCommand(1)]), operationId: '' },
      { ...batch([patchCommand(1)]), operationId: 'x'.repeat(161) },
    ])
      expect(captureEditingBatch(input).ok).toBe(false);
    const oversized = batch([
      {
        type: 'document.patch',
        patch: [{ op: 'replace', path: '/title', value: 'x'.repeat(1_048_577) }],
      },
    ]);
    expect(captureEditingBatch(oversized)).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'limit.bytes' }],
    });
  });

  it('bounds intermediate growth even if a later command would remove it', () => {
    const source = state(),
      baselineBytes = new TextEncoder().encode(JSON.stringify(source.document)).byteLength;
    const result = applyEditingBatch(
      source,
      batch(
        [
          {
            type: 'node.patch',
            nodeId: 'root',
            patch: [{ op: 'add', path: '/props', value: { description: 'x'.repeat(500) } }],
          },
          { type: 'node.patch', nodeId: 'root', patch: [{ op: 'remove', path: '/props' }] },
        ],
        source,
      ),
      { limits: { maxBytes: baselineBytes + 100 } },
    );
    expect(result).toMatchObject({
      ok: false,
      commandIndex: 0,
      diagnostics: [{ code: 'limit.bytes' }],
    });
    expect(source.document.ui).not.toHaveProperty('props');
  });

  it('bounds copy amplification within one RFC patch even when a following remove restores the size', () => {
    const source = state();
    source.document.dataSchema.$defs = { original: { type: 'string', enum: ['x'.repeat(400)] } };
    const baseline = structuredClone(source);
    const baselineBytes = new TextEncoder().encode(JSON.stringify(source.document)).byteLength;
    const result = applyEditingBatch(
      source,
      batch(
        [
          {
            type: 'document.patch',
            patch: [
              { op: 'copy', from: '/dataSchema/$defs/original', path: '/dataSchema/$defs/copied' },
              { op: 'remove', path: '/dataSchema/$defs/copied' },
            ],
          },
        ],
        source,
      ),
      { limits: { maxBytes: baselineBytes + 100 } },
    );
    expect(result).toMatchObject({
      ok: false,
      commandIndex: 0,
      diagnostics: [{ code: 'limit.bytes' }],
    });
    expect(result).not.toHaveProperty('document');
    expect(source).toEqual(baseline);
  });
  it('treats UI node and rule limits as hard failures even for incomplete drafts', () => {
    const source = state();
    const inserted = applyEditingBatch(
      source,
      batch([
        {
          type: 'node.insert',
          parentId: 'root',
          beforeId: null,
          node: group('container', 'layout.stack', [group('one'), group('two'), group('three')]),
        },
      ]),
      { limits: { maxNodes: 3 } },
    );
    expect(inserted).toMatchObject({
      ok: false,
      commandIndex: 0,
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'limit.nodes' })]),
    });
    const baseline = state();
    baseline.document.ui.children = [group('one'), group('two'), group('three')];
    expect(
      applyEditingBatch(baseline, batch([patchCommand(1)], baseline), { limits: { maxNodes: 3 } }),
    ).toMatchObject({ ok: false });
    const rules = applyEditingBatch(
      source,
      batch([
        {
          type: 'node.patch',
          nodeId: 'root',
          patch: [
            {
              op: 'add',
              path: '/rules',
              value: {
                visible: {
                  op: 'and',
                  conditions: [{ op: 'eq', left: { literal: true }, right: { literal: true } }],
                },
              },
            },
          ],
        },
      ]),
      { limits: { maxRuleNodes: 1 } },
    );
    expect(rules).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'limit.rules' })]),
    });
    expect(source.document.ui).not.toHaveProperty('children.0');
  });
});
