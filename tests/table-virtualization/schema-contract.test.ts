import { describe, expect, it, vi } from 'vitest';
import { isTableVirtualization } from '@haven/schema';
import type { TableVirtualization } from '@haven/schema';

describe('table virtualization presentation contract', () => {
  it.each<TableVirtualization>([
    {},
    { viewportHeight: 64 },
    { viewportHeight: 4096 },
    { viewportHeight: 320.5 },
    { estimateRowHeight: 16 },
    { estimateRowHeight: 512 },
    { estimateRowHeight: 32.25 },
    { overscan: 0 },
    { overscan: 50 },
    { viewportHeight: 480, estimateRowHeight: 48, overscan: 5 },
  ])('accepts empty defaults and inclusive finite CSS-pixel/row-count boundaries: %j', (value) => {
    const before = structuredClone(value);
    expect(isTableVirtualization(Object.freeze(value))).toBe(true);
    expect(value).toEqual(before);
  });

  it('does not populate defaults or require object prototypes beyond plain JSON records', () => {
    const empty = {},
      nullPrototype = Object.assign(Object.create(null) as object, { overscan: 0 });
    expect(isTableVirtualization(empty)).toBe(true);
    expect(Object.keys(empty)).toEqual([]);
    expect(isTableVirtualization(nullPrototype)).toBe(true);
    expect(Object.getPrototypeOf(nullPrototype)).toBeNull();
  });

  it.each([
    null,
    undefined,
    false,
    true,
    480,
    '480px',
    [],
    { viewportHeight: 63.99 },
    { viewportHeight: 4096.01 },
    { viewportHeight: 0 },
    { viewportHeight: NaN },
    { viewportHeight: Infinity },
    { viewportHeight: '480' },
    { viewportHeight: null },
    { viewportHeight: undefined },
    { estimateRowHeight: 15.99 },
    { estimateRowHeight: 512.01 },
    { estimateRowHeight: -Infinity },
    { estimateRowHeight: [] },
    { overscan: -1 },
    { overscan: 51 },
    { overscan: 0.5 },
    { overscan: NaN },
    { overscan: true },
    { overscan: 1n },
    { overscan: new Number(2) },
    { getItemKey: () => 'business-key' },
    { rangeExtractor: 'host.callback' },
    { enabled: false },
    { pagination: 'server' },
    { viewportHeight: 480, estimateRowHeight: 36, overscan: 5, unknown: 1 },
  ])('rejects non-JSON values, callbacks, unknown options and invalid bounds: %#', (value) => {
    expect(isTableVirtualization(value)).toBe(false);
  });

  it('rejects symbols, accessors, hidden properties and classes without executing them', () => {
    const getter = vi.fn(() => 480),
      accessor = {};
    Object.defineProperty(accessor, 'viewportHeight', { get: getter, enumerable: true });
    const hidden = {};
    Object.defineProperty(hidden, 'overscan', { value: 0 });
    class Config {
      viewportHeight = 480;
    }
    for (const value of [
      accessor,
      hidden,
      new Config(),
      new Date(),
      Object.create({ overscan: 2 }),
      { [Symbol('native')]: true },
      { viewportHeight: 480, estimateRowHeight: 36, overscan: 5, [Symbol('native')]: true },
    ])
      expect(isTableVirtualization(value)).toBe(false);
    expect(getter).not.toHaveBeenCalled();
  });

  it('fails closed on hostile reflection and only inspects a bounded set of configuration values', () => {
    const getter = vi.fn(() => {
      throw new Error('must not run');
    });
    const large = Object.create(null) as object;
    for (let at = 0; at < 10000; at++)
      Object.defineProperty(large, `unknown-${at}`, { get: getter, enumerable: true });
    const proxy = new Proxy(
      {},
      {
        ownKeys: () => {
          throw new Error('private reflection details');
        },
      },
    );
    const cyclic: { viewportHeight?: unknown } = {};
    cyclic.viewportHeight = cyclic;
    for (const value of [large, proxy, cyclic]) expect(isTableVirtualization(value)).toBe(false);
    expect(getter).not.toHaveBeenCalled();
  });
});
