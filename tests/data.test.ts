import { describe, expect, it } from 'vitest';
import { reconcileData } from '@haven/runtime';
import type { DataSchema } from '@haven/schema';

describe('data reconciliation during modelling', () => {
  const schema: DataSchema = {
    type: 'object',
    properties: {
      title: { type: 'string' },
      count: { type: 'number' },
      active: { type: 'boolean' },
    },
  };
  it('keeps numeric fields empty rather than injecting a business default', () => {
    expect(reconcileData(schema)).toEqual({ title: '', count: null, active: false });
  });
  it('preserves compatible values and object identity across presentation changes', () => {
    const current = { title: 'User input', count: 12, active: true };
    expect(reconcileData(schema, current)).toBe(current);
  });
  it('only initializes added or type-changed fields and drops removed properties', () => {
    expect(reconcileData(schema, { title: 12, count: 0, active: false, removed: 'old' })).toEqual({
      title: '',
      count: 0,
      active: false,
    });
  });
  it('keeps array object identities so Signal Forms can track reorder state', () => {
    const item = { title: 'A' };
    const values = [item];
    const array: DataSchema = {
      type: 'array',
      items: { type: 'object', properties: { title: { type: 'string' } } },
    };
    expect(reconcileData(array, values)).toBe(values);
    expect(
      reconcileData(
        {
          ...array,
          items: {
            type: 'object',
            properties: { title: { type: 'string' }, extra: { type: 'boolean' } },
          },
        },
        values,
      ),
    ).toEqual([{ title: 'A', extra: false }]);
  });
  it('resolves local schema references and rejects unresolved ones', () => {
    expect(reconcileData({ $ref: '#/$defs/value', $defs: { value: { type: 'string' } } })).toBe('');
    expect(() => reconcileData({ $ref: '#/$defs/missing' })).toThrow('Unresolved');
  });
});
