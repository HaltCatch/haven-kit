import { describe, expect, it, vi } from 'vitest';
import { OptionSearch } from '../packages/runtime/src/option-search.js';
import type { Option, OptionsAdapter } from '../packages/runtime/src/adapters.js';
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function adapter(overrides: Partial<OptionsAdapter> = {}): OptionsAdapter {
  return { search: async () => ({ items: [] }), resolve: async () => [], ...overrides };
}

describe('remote option request state', () => {
  it('isolates search and resolve lanes and ignores stale searches whose transport ignores abort', async () => {
    const first = deferred<{ items: Option[] }>(),
      second = deferred<{ items: Option[] }>();
    const selected = deferred<Option[]>();
    const signals: AbortSignal[] = [];
    const source = adapter({
      search: ({ text, signal }) => {
        signals.push(signal);
        return text === 'old' ? first.promise : second.promise;
      },
      resolve: () => selected.promise,
    });
    const state = new OptionSearch();
    const old = state.search(source, 'old', 'en-US');
    const resolve = state.resolve(source, [0], 'en-US');
    const current = state.search(source, 'new', 'en-US');
    expect(signals[0]!.aborted).toBe(true);
    second.resolve({ items: [{ key: 1, label: 'Newest result' }] });
    selected.resolve([{ key: 0, label: 'Saved selection' }]);
    await Promise.all([current, resolve]);
    first.resolve({ items: [{ key: 2, label: 'Stale result' }] });
    await old;
    expect(state.state.items.map((item) => item.key)).toEqual([1]);
    expect(state.state.resolved.map((item) => item.key)).toEqual([0]);
    expect(state.state.resolveReady).toBe(true);
    expect(state.state.searching).toBe(false);
  });
  it('does not commit a completed search if a new query starts before the caller continuation', async () => {
    const fresh = deferred<{ items: Option[] }>();
    const source = adapter({
      search: ({ text }) =>
        text === 'old' ? Promise.resolve({ items: [{ key: 'old', label: 'Old' }] }) : fresh.promise,
    });
    const state = new OptionSearch();
    const old = state.search(source, 'old', 'en-US');
    let current!: Promise<void>;
    queueMicrotask(() =>
      queueMicrotask(() => {
        current = state.search(source, 'new', 'zh-CN');
      }),
    );
    await old;
    expect(state.state.items).toEqual([]);
    expect(state.state.searching).toBe(true);
    fresh.resolve({ items: [{ key: 'new', label: 'New' }] });
    await current;
    expect(state.state.items.map((option) => option.key)).toEqual(['new']);
  });
  it('does not commit a completed resolution after selection identity changes', async () => {
    const fresh = deferred<Option[]>();
    const source = adapter({
      resolve: (keys) =>
        keys[0] === 'old' ? Promise.resolve([{ key: 'old', label: 'Old' }]) : fresh.promise,
    });
    const state = new OptionSearch();
    const old = state.resolve(source, ['old'], 'en-US');
    let current!: Promise<void>;
    queueMicrotask(() =>
      queueMicrotask(() => {
        current = state.resolve(source, ['new'], 'zh-CN');
      }),
    );
    await old;
    expect(state.state.keys).toEqual(['new']);
    expect(state.state.resolved).toEqual([]);
    expect(state.state.resolving).toBe(true);
    fresh.resolve([{ key: 'new', label: 'New' }]);
    await current;
    expect(state.state.resolved.map((option) => option.key)).toEqual(['new']);
  });
  it('keeps both lanes cancelled if cancellation runs between request completion and commit', async () => {
    const state = new OptionSearch();
    const source = adapter({
      search: async () => ({ items: [{ key: 0, label: 'Zero' }] }),
      resolve: async () => [{ key: 0, label: 'Zero' }],
    });
    const work = [state.search(source, '', 'en-US'), state.resolve(source, [0], 'en-US')];
    queueMicrotask(() =>
      queueMicrotask(() => {
        state.cancelSearch();
        state.cancelResolve();
      }),
    );
    await Promise.all(work);
    expect(state.state).toEqual(OptionSearch.initialState());
    await state.search(source, '', 'zh-CN');
    await state.resolve(source, [0], 'zh-CN');
    expect(state.state.items).toHaveLength(1);
    expect(state.state.resolveReady).toBe(true);
  });
  it('does not apply an old rejection to new search and resolve identities', async () => {
    const pendingSearch = deferred<{ items: Option[] }>();
    const pendingResolve = deferred<Option[]>();
    const source = adapter({
      search: ({ text }) =>
        text === 'old' ? Promise.reject(new Error('Old failure')) : pendingSearch.promise,
      resolve: (keys) =>
        keys[0] === 'old' ? Promise.reject(new Error('Old failure')) : pendingResolve.promise,
    });
    const state = new OptionSearch();
    const work = [state.search(source, 'old', 'en-US'), state.resolve(source, ['old'], 'en-US')];
    let current: Promise<void>[] = [];
    queueMicrotask(() =>
      queueMicrotask(() => {
        current = [state.search(source, 'new', 'zh-CN'), state.resolve(source, ['new'], 'zh-CN')];
      }),
    );
    await Promise.all(work);
    expect(state.state.searchError).toBeNull();
    expect(state.state.resolveError).toBeNull();
    expect(state.state.searching).toBe(true);
    expect(state.state.resolving).toBe(true);
    pendingSearch.resolve({ items: [] });
    pendingResolve.resolve([]);
    await Promise.all(current);
    expect(state.state.resolveReady).toBe(true);
  });
  it('separates typed zero keys and propagates locale while superseding old resolutions', async () => {
    const old = deferred<Option[]>();
    const firstSource = adapter({ resolve: () => old.promise });
    const secondSource = adapter({
      resolve: vi.fn(async () => [
        { key: 0, label: '零' },
        { key: '0', label: '字符串零' },
      ]),
    });
    const state = new OptionSearch();
    const first = state.resolve(firstSource, [0], 'en-US');
    await state.resolve(secondSource, [0, '0'], 'zh-CN');
    old.resolve([{ key: 0, label: 'Obsolete' }]);
    await first;
    expect(secondSource.resolve).toHaveBeenCalledWith([0, '0'], expect.any(AbortSignal), {
      locale: 'zh-CN',
    });
    expect(state.state.resolved.map((item) => item.label)).toEqual(['零', '字符串零']);
  });
  it('preserves loaded pages on failure and retries the same cursor without duplicating rows', async () => {
    const search = vi
      .fn<OptionsAdapter['search']>()
      .mockResolvedValueOnce({ items: [{ key: 0, label: 'Zero' }], nextCursor: 'next' })
      .mockRejectedValueOnce(new Error('Transport details must stay out of UI'))
      .mockResolvedValueOnce({ items: [{ key: 1, label: 'One' }] });
    const state = new OptionSearch();
    await state.search(adapter({ search }), 'query', 'en-US');
    await state.more();
    expect(state.state.searchError).toBe('adapter');
    expect(state.state.items.map((item) => item.key)).toEqual([0]);
    await state.retrySearch();
    expect(search.mock.calls[1]![0].cursor).toBe('next');
    expect(search.mock.calls[2]![0].cursor).toBe('next');
    expect(state.state.items.map((item) => item.key)).toEqual([0, 1]);
    expect(state.state.nextCursor).toBeUndefined();
    expect(state.state.searchError).toBeNull();
  });
  it('rejects malformed, duplicate, unbounded and hierarchical flat-option responses', async () => {
    const invalid: unknown[] = [
      { items: [{ key: NaN, label: 'Invalid' }] },
      { items: [{ key: '', label: 'Invalid' }] },
      {
        items: [
          { key: 0, label: 'Zero' },
          { key: 0, label: 'Duplicate' },
        ],
      },
      { items: [{ key: 0, label: 3 }] },
      { items: [{ key: 0, label: 'Zero', disabled: 'no' }] },
      { items: [{ key: 0, label: 'Zero', children: [] }] },
      { items: [], nextCursor: '' },
      { items: [], nextCursor: 0 },
      { items: Array.from({ length: 1001 }, (_, key) => ({ key, label: String(key) })) },
    ];
    for (const response of invalid) {
      const state = new OptionSearch();
      await state.search(
        adapter({ search: async () => response as Awaited<ReturnType<OptionsAdapter['search']>> }),
        '',
        'en-US',
      );
      expect(state.state.searchError).toBe('response');
      expect(state.state.items).toEqual([]);
    }
  });
  it('rejects cursor loops and duplicate keys across pages without corrupting accepted data', async () => {
    for (const next of [
      { items: [{ key: 1, label: 'One' }], nextCursor: 'a' },
      { items: [{ key: 0, label: 'Duplicate' }] },
    ]) {
      const search = vi
        .fn<OptionsAdapter['search']>()
        .mockResolvedValueOnce({ items: [{ key: 0, label: 'Zero' }], nextCursor: 'a' })
        .mockResolvedValueOnce(next);
      const state = new OptionSearch();
      await state.search(adapter({ search }), '', 'en-US');
      await state.more();
      expect(state.state.searchError).toBe('response');
      expect(state.state.items.map((item) => item.key)).toEqual([0]);
    }
  });
  it('accepts unresolved saved keys without clearing them, rejects extraneous resolve results, and retries', async () => {
    const resolve = vi
      .fn<OptionsAdapter['resolve']>()
      .mockResolvedValueOnce([{ key: 99, label: 'Unrequested' }])
      .mockResolvedValueOnce([{ key: 0, label: 'Known' }]);
    const state = new OptionSearch();
    await state.resolve(adapter({ resolve }), [0, 'unknown'], 'en-US');
    expect(state.state.resolveError).toBe('response');
    expect(state.state.keys).toEqual([0, 'unknown']);
    await state.retryResolve();
    expect(state.state.resolveReady).toBe(true);
    expect(state.state.keys).toEqual([0, 'unknown']);
    expect(state.state.resolved.map((item) => item.key)).toEqual([0]);
  });
  it('copies and freezes adapter responses and cancels both lanes on disposal', async () => {
    const result = { items: [{ key: 0, label: 'Before mutation' }] };
    const search = new OptionSearch();
    await search.search(adapter({ search: async () => result }), '', 'en-US');
    result.items[0]!.label = 'After mutation';
    expect(search.state.items[0]!.label).toBe('Before mutation');
    expect(Object.isFrozen(search.state.items[0])).toBe(true);
    const pending = deferred<{ items: Option[] }>(),
      pendingResolve = deferred<Option[]>();
    const signals: AbortSignal[] = [];
    const source = adapter({
      search: ({ signal }) => {
        signals.push(signal);
        return pending.promise;
      },
      resolve: (_keys, signal) => {
        signals.push(signal);
        return pendingResolve.promise;
      },
    });
    const changed = vi.fn();
    const state = new OptionSearch(changed);
    const work = [state.search(source, '', 'en-US'), state.resolve(source, [0], 'en-US')];
    state.dispose();
    const count = changed.mock.calls.length;
    pending.resolve({ items: [{ key: 1, label: 'Too late' }] });
    pendingResolve.reject(new Error('Ignored stale rejection'));
    await Promise.all(work);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(changed).toHaveBeenCalledTimes(count);
    await state.search(source, 'after disposal', 'en-US');
    expect(signals).toHaveLength(2);
  });
});
