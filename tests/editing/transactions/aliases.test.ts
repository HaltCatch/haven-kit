import { expect, it } from 'vitest';
import { applyEditingBatch } from '@haven/runtime/editing';
import { frozen, group } from '../primitives/support.js';
import { batch, state } from './support.js';

it('interprets shared host document references as independent JSON tree locations', () => {
  const source = state(),
    shared = { type: 'string' as const, maxLength: 5 };
  source.document.dataSchema.properties = { a: shared, b: shared };
  frozen(source);
  const result = applyEditingBatch(
    source,
    batch(
      [
        {
          type: 'document.patch',
          patch: [{ op: 'replace', path: '/dataSchema/properties/a/maxLength', value: 7 }],
        },
      ],
      source,
    ),
    { requireValid: true },
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  expect(result.document.dataSchema.properties!['a']!.maxLength).toBe(7);
  expect(result.document.dataSchema.properties!['b']!.maxLength).toBe(5);
  expect(shared.maxLength).toBe(5);
});

it('does not introduce aliases from shared command resource declarations', () => {
  const source = frozen(state()),
    shared = { type: 'query' as const, adapter: 'original' };
  const commands = frozen(
    batch(
      [
        {
          type: 'node.insert',
          parentId: 'root',
          beforeId: null,
          node: group('container'),
          defaults: { resources: { a: shared, b: shared } },
        },
        {
          type: 'document.patch',
          patch: [{ op: 'replace', path: '/resources/a/adapter', value: 'changed' }],
        },
      ],
      source,
    ),
  );
  const result = applyEditingBatch(source, commands, { requireValid: true });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  expect(result.document.resources['a']!.adapter).toBe('changed');
  expect(result.document.resources['b']!.adapter).toBe('original');
  expect(shared.adapter).toBe('original');
});
