import { expect, it } from 'vitest';
import { copyTableEditResult } from '@haven/runtime';

it('snapshots canonical table commit results before exposing a frozen bounded response', () => {
  const row = { id: 0, name: 'Canonical', nested: { unchanged: true } };
  const result = copyTableEditResult({ status: 'applied', row });
  row.name = 'Mutated after returning';
  expect(result).toEqual({
    status: 'applied',
    row: { id: 0, name: 'Canonical', nested: { unchanged: true } },
  });
  expect(Object.isFrozen(result)).toBe(true);
  if (result.status === 'applied') expect(Object.isFrozen(result.row['nested'])).toBe(true);
});

it('rejects accessors without executing them, symbols, cycles, classes and sparse result arrays', () => {
  let reads = 0;
  const getter = {
    status: 'applied',
    get row() {
      reads++;
      return { id: 0 };
    },
  };
  expect(() => copyTableEditResult(getter)).toThrow();
  expect(reads).toBe(0);
  const cycle: Record<string, unknown> = {};
  cycle['self'] = cycle;
  class Row {
    id = 0;
  }
  const sparse = [{ path: '/name', code: 'server' }];
  Reflect.deleteProperty(sparse, '0');
  for (const value of [
    { status: 'applied', row: { id: NaN } },
    { status: 'applied', row: { id: 0, [Symbol('metadata')]: true } },
    { status: 'applied', row: cycle },
    { status: 'applied', row: new Row() },
    { status: 'invalid', errors: sparse },
    { status: 'error', code: 'http://untrusted' },
    { status: 'applied', row: { id: 0 }, extra: true },
  ])
    expect(() => copyTableEditResult(value)).toThrow();
});

it('keeps the existing failure protocol while enforcing result transport limits', () => {
  for (const value of [
    { status: 'conflict' },
    { status: 'error', code: 'denied' },
    { status: 'invalid', errors: [{ path: '/name', code: 'required' }] },
  ])
    expect(copyTableEditResult(value)).toEqual(value);
  expect(() =>
    copyTableEditResult({ status: 'applied', row: { id: 0, value: 'x'.repeat(5_000_001) } }),
  ).toThrow();
});
