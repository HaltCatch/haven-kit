import { describe, expect, it, vi } from 'vitest';
import type { JsonObject } from '@haven/schema';
import { buildTableHierarchy } from '@haven/runtime';
import { hierarchy, row } from './support.js';

describe('table hierarchy validation', () => {
  it.each([
    { rows: [row('same', null), row('same', null)], code: 'duplicateKey', at: 1 },
    { rows: [{ parent: null }], code: 'rowKey', at: 0 },
    { rows: [row('', null)], code: 'rowKey', at: 0 },
    { rows: [{ id: 'root' }], code: 'parentKey', at: 0 },
    { rows: [row('child', 'missing')], code: 'orphan', at: 0 },
    { rows: [row('self', 'self')], code: 'cycle', at: 0 },
    { rows: [row('a', 'b'), row('b', 'a')], code: 'cycle', at: 0 },
    { rows: [row('valid', null), row('a', 'b'), row('b', 'a')], code: 'cycle', at: 1 },
    {
      rows: [row('root', null), row('child', null)],
      code: 'parentKey',
      at: 0,
      config: { ...hierarchy, rootValue: '' },
    },
    {
      rows: Array.from({ length: 33 }, (_, index) => row(index, index ? index - 1 : null)),
      code: 'depth',
      at: 32,
    },
  ])(
    'fails atomically and locates invalid $code at the original flat row',
    ({ rows, code, at, config }) => {
      const before = structuredClone(rows),
        result = buildTableHierarchy(rows, '/id', config ?? hierarchy);
      expect(result).toMatchObject({ status: 'error', issue: { code, row: at } });
      expect('index' in result).toBe(false);
      expect(rows).toEqual(before);
    },
  );

  it('rejects root-marker collisions using exact typed identity', () => {
    expect(buildTableHierarchy([row(0, 0)], '/id', { ...hierarchy, rootValue: 0 })).toEqual({
      status: 'error',
      issue: { code: 'rootCollision', row: 0, key: 0, path: '/id' },
    });
    expect(
      buildTableHierarchy([row('root', 'root')], '/id', { ...hierarchy, rootValue: 'root' }),
    ).toMatchObject({ status: 'error', issue: { code: 'rootCollision' } });
  });

  it.each([
    { rowKey: '', config: hierarchy },
    { rowKey: '/id', config: undefined },
    { rowKey: '/id', config: { parentPath: '/parent' } },
    { rowKey: '/id', config: { ...hierarchy, parentPath: '/id' } },
    { rowKey: '/id/nested', config: { ...hierarchy, parentPath: '/id' } },
    { rowKey: '/id', config: { ...hierarchy, parentPath: '/id/nested' } },
    { rowKey: '/id', config: { ...hierarchy, rootValue: false } },
    { rowKey: '/id', config: { ...hierarchy, parentPath: '/constructor/value' } },
    { rowKey: '/id', config: { ...hierarchy, adapter: 'application.permission' } },
  ])('does not index invalid or overlapping configuration: %j', ({ rowKey, config }) => {
    expect(buildTableHierarchy([row('root', null)], rowKey, config)).toEqual({
      status: 'error',
      issue: { code: 'configuration' },
    });
  });

  it('rejects malformed data, graph limits and non-JSON transport values without invoking getters', () => {
    expect(buildTableHierarchy({}, '/id', hierarchy)).toEqual({
      status: 'error',
      issue: { code: 'rows' },
    });
    expect(buildTableHierarchy([null], '/id', hierarchy)).toMatchObject({
      status: 'error',
      issue: { code: 'rows', row: 0 },
    });
    expect(
      buildTableHierarchy(
        Array.from({ length: 5001 }, (_, index) => row(index, null)),
        '/id',
        hierarchy,
      ),
    ).toEqual({ status: 'error', issue: { code: 'limit' } });
    const getter = vi.fn(() => 'injected'),
      accessor = { parent: null },
      sparse: unknown[] = [];
    Object.defineProperty(accessor, 'id', { get: getter, enumerable: true });
    sparse.length = 1;
    class Record {
      id = 'root';
      parent = null;
    }
    const symbolic = row('root', null),
      cyclic: JsonObject = row('root', null);
    Object.defineProperty(symbolic, Symbol('native'), { value: 'not transport' });
    cyclic['cycle'] = cyclic;
    for (const source of [
      [accessor],
      [new Record()],
      sparse,
      [symbolic],
      [cyclic],
      [row(Number.NaN, null)],
    ])
      expect(buildTableHierarchy(source, '/id', hierarchy)).toEqual({
        status: 'error',
        issue: { code: 'json' },
      });
    expect(getter).not.toHaveBeenCalled();
  });
});
