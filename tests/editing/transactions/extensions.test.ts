import { describe, expect, it } from 'vitest';
import { applyEditingBatch } from '@haven/runtime/editing';
import type { EditingOptions } from '@haven/runtime/editing';
import { group } from '../primitives/support.js';
import { batch, state } from './support.js';

describe('registered editing capabilities', () => {
  it('uses the supplied custom container registry for both insertion and moving', () => {
    const source = state();
    source.document.ui = group('root', 'host.container', [group('destination', 'host.container')]);
    const manifests: EditingOptions['manifests'] = new Map([
      [
        'host.container@1',
        {
          kind: 'host.container',
          version: 1,
          title: 'Host container',
          container: true,
          binding: 'none',
          dataTypes: [],
          events: [],
          properties: {},
        },
      ],
    ]);
    const result = applyEditingBatch(
      source,
      batch(
        [
          {
            type: 'node.insert',
            parentId: 'root',
            beforeId: 'destination',
            node: group('inserted', 'host.container'),
          },
          { type: 'node.move', nodeId: 'inserted', parentId: 'destination', beforeId: null },
        ],
        source,
      ),
      { manifests, requireValid: true },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.validation.valid).toBe(true);
    expect(result.document.ui.children![0]!.children![0]!.id).toBe('inserted');
    expect(source.document.ui.children).toHaveLength(1);
    expect(source.document.ui.children![0]!.children).toEqual([]);
  });
});
