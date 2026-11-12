import { describe, expect, it, vi } from 'vitest';
import { validateDocument } from '@haven/schema';
import { model } from './model.js';

const rejected = (value: unknown) => {
  let result: ReturnType<typeof validateDocument> | undefined;
  expect(() => {
    result = validateDocument(value);
  }).not.toThrow();
  expect(result).toMatchObject({
    structural: false,
    valid: false,
    capabilities: [],
    diagnostics: [{ code: 'structure.json', path: '' }],
  });
};

describe('descriptor-safe document validation boundary', () => {
  it('does not evaluate an object getter before contract validation or let its exception escape', () => {
    const getter = vi.fn(() => {
      throw new Error('Getter must not execute');
    });
    const value = model();
    Object.defineProperty(value.ui, 'props', { enumerable: true, get: getter });
    rejected(value);
    expect(getter).not.toHaveBeenCalled();
  });

  it('does not evaluate array index accessors, even when they would return an otherwise valid child', () => {
    const getter = vi.fn(() => ({
      id: 'child',
      kind: 'view.text',
      version: 1,
      props: { text: 'Child' },
    }));
    const value = model();
    Object.defineProperty(value.ui.children, 0, { enumerable: true, get: getter });
    rejected(value);
    expect(getter).not.toHaveBeenCalled();
  });

  it('rejects sparse arrays, inherited array classes, own symbols and hidden properties instead of dropping them', () => {
    class Children extends Array<unknown> {}
    const sparse = new Array(1),
      symbolic = model(),
      hidden = model();
    Object.defineProperty(symbolic, Symbol('metadata'), { value: true });
    Object.defineProperty(hidden, 'hidden', { value: 'not JSON', enumerable: false });
    const extra = [] as unknown[] & { extra?: boolean };
    extra.extra = true;
    for (const children of [sparse, new Children(), extra]) {
      const value = model();
      Object.defineProperty(value.ui, 'children', { value: children, enumerable: true });
      rejected(value);
    }
    rejected(symbolic);
    rejected(hidden);
  });

  it('rejects cyclic/non-finite/non-JSON/class values and retains unsafe-key diagnostics', () => {
    const cycle = model() as unknown as Record<string, unknown>;
    cycle['self'] = cycle;
    for (const value of [
      cycle,
      { value: NaN },
      { value: undefined },
      { value: () => 0 },
      new Date(),
    ])
      rejected(value);
    expect(validateDocument(JSON.parse('{"__proto__":{}}')).diagnostics[0]?.code).toBe(
      'structure.key',
    );
    expect(validateDocument(JSON.parse('{"constructor":{}}')).diagnostics[0]?.code).toBe(
      'structure.key',
    );
  });

  it('converts Proxy introspection failures into JSON diagnostics', () => {
    const error = () => {
      throw new Error('Uninspectable');
    };
    for (const traps of [
      { getPrototypeOf: error },
      { ownKeys: error },
      { getOwnPropertyDescriptor: error },
    ])
      rejected(new Proxy(model(), traps));
    const revocable = Proxy.revocable(model(), {});
    revocable.revoke();
    rejected(revocable.proxy);
  });

  it('uses the descriptor snapshot throughout validation without invoking a Proxy get trap later', () => {
    const getter = vi.fn(() => {
      throw new Error('Ordinary get must not execute');
    });
    const value = new Proxy(model(), { get: getter });
    expect(validateDocument(value).diagnostics).toEqual([]);
    expect(getter).not.toHaveBeenCalled();
  });

  it('retains shared acyclic objects, input identity and first-location semantic diagnostics', () => {
    const value = model(),
      shared = { type: 'string' as const };
    value.dataSchema.properties = { first: shared, second: shared };
    const before = structuredClone(value);
    expect(validateDocument(value).diagnostics).toEqual([]);
    expect(value).toEqual(before);
    expect(value.dataSchema.properties['first']).toBe(shared);
    expect(value.dataSchema.properties['second']).toBe(shared);
    Object.assign(shared, { minimum: 1 });
    expect(validateDocument(value).diagnostics).toEqual([
      expect.objectContaining({
        code: 'data.keyword',
        path: '/dataSchema/properties/first/minimum',
      }),
    ]);
  });

  it('accepts ordinary frozen and null-prototype JSON without mutating it', () => {
    const value = model();
    value.ui.props = Object.freeze(
      Object.assign(Object.create(null) as object, { title: 'Frozen title' }),
    );
    Object.freeze(value);
    expect(validateDocument(value).diagnostics).toEqual([]);
    expect(Object.isFrozen(value.ui.props)).toBe(true);
  });
});
