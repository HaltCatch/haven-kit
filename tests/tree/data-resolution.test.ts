import { describe, expect, it, vi } from 'vitest';
import type { RemoteTreeNode } from '@haven/schema';
import { TreeDataLoader } from '../../packages/runtime/src/tree/data.js';
import type { TreeResolution } from '../../packages/runtime/src/tree/types.js';
import { adapter, deferred, node } from './data-support.js';

describe('lazy tree complete path resolution', () => {
  it('separates partial selection paths from complete children and keeps canonical node identities', async () => {
    const source = adapter({
      resolve: async () => ({ paths: [[node('root', true), node(0)]], unresolved: ['0'] }),
      children: async (parent) => (parent === null ? [node('root', true)] : [node(0), node('0')]),
    });
    const loader = new TreeDataLoader();
    loader.setSource({ identity: 'one', adapter: source }, 'en-US');
    await loader.resolve([0, '0']);
    expect(loader.state.resolveReady).toBe(true);
    expect(loader.state.unresolved).toEqual(['0']);
    expect(loader.state.entries.get(0)?.path).toEqual(['root', 0]);
    expect(loader.state.branches.size).toBe(0);
    const resolved = loader.state.entries.get('root')!.node;
    await loader.load(null);
    expect(loader.state.branches.get(null)?.nodes[0]).toBe(resolved);
    await loader.load('root');
    expect(loader.state.branches.get('root')?.nodes[0]).toBe(loader.state.entries.get(0)?.node);
    await loader.resolve([0, '0']);
    expect(loader.state.branches.get(null)?.nodes[0]).toBe(loader.state.entries.get('root')?.node);
  });
  it('resolves disabled ancestors while preserving requested keys and explicit unknown values', async () => {
    const source = adapter({
      resolve: async () => ({
        paths: [[node('root', true, true), node('child')]],
        unresolved: ['unknown'],
      }),
    });
    const loader = new TreeDataLoader();
    loader.setSource({ identity: 'one', adapter: source }, 'en-US');
    await loader.resolve(['child', 'unknown']);
    expect(loader.state.keys).toEqual(['child', 'unknown']);
    expect(loader.state.entries.get('child')?.disabled).toBe(true);
    expect(loader.state.unresolved).toEqual(['unknown']);
  });
  it('keeps branch and selection lanes independent and ignores older selection results', async () => {
    const old = deferred<TreeResolution>(),
      fresh = deferred<TreeResolution>(),
      root = deferred<RemoteTreeNode[]>();
    const signals: AbortSignal[] = [];
    const source = adapter({
      children: () => root.promise,
      resolve: (keys, { signal }) => {
        signals.push(signal);
        return keys[0] === 'old' ? old.promise : fresh.promise;
      },
    });
    const loader = new TreeDataLoader();
    loader.setSource({ identity: 'one', adapter: source }, 'en-US');
    const branch = loader.load(null),
      first = loader.resolve(['old']),
      second = loader.resolve(['fresh']);
    expect(signals[0]?.aborted).toBe(true);
    fresh.resolve({ paths: [[node('fresh')]], unresolved: [] });
    await second;
    root.resolve([node('fresh')]);
    await branch;
    old.resolve({ paths: [[node('old')]], unresolved: [] });
    await first;
    expect(loader.state.keys).toEqual(['fresh']);
    expect(loader.state.entries.has('old')).toBe(false);
    expect(loader.state.branches.get(null)?.status).toBe('ready');
  });
  it('does not request an adapter for an empty selection, rejects duplicate/oversized keys, and retries errors', async () => {
    let fail = true;
    const resolve = vi.fn(async () => {
      if (fail) throw new Error('private');
      return { paths: [[node(0)]], unresolved: [] };
    });
    const loader = new TreeDataLoader();
    loader.setSource({ identity: 'one', adapter: adapter({ resolve }) }, 'en-US');
    await loader.resolve([]);
    expect(loader.state.resolveReady).toBe(true);
    expect(resolve).not.toHaveBeenCalled();
    await loader.resolve([0, 0]);
    expect(loader.state.resolveError).toBe('response');
    await loader.resolve(Array.from({ length: 5001 }, (_, i) => i));
    expect(resolve).not.toHaveBeenCalled();
    await loader.resolve([0]);
    expect(loader.state.resolveError).toBe('adapter');
    expect(loader.state.keys).toEqual([0]);
    fail = false;
    await loader.retryResolve();
    expect(loader.state.resolveReady).toBe(true);
    expect(loader.state.entries.has(0)).toBe(true);
  });
  it.each(['same-source', 'new-owner'] as const)(
    'abort callbacks can start a fresh selection without older state overwriting it: %s',
    async (mode) => {
      const stale = deferred<TreeResolution>(),
        fresh = deferred<TreeResolution>();
      let current!: Promise<void>;
      const changes: string[] = [];
      const loader = new TreeDataLoader((state) => changes.push(JSON.stringify(state.keys)));
      const source = adapter({
        resolve: async (keys, { signal }) => {
          if (keys[0] === 'old') {
            signal.addEventListener('abort', () => {
              if (mode === 'new-owner')
                loader.setSource({ identity: 'new', adapter: source }, 'zh-CN');
              current = loader.resolve(['fresh']);
            });
            return stale.promise;
          }
          return fresh.promise;
        },
      });
      loader.setSource({ identity: 'old', adapter: source }, 'en-US');
      const old = loader.resolve(['old']);
      // An invalid outer attempt must not write its failure over the request started on abort.
      await loader.resolve(['invalid', 'invalid']);
      expect(loader.state.keys).toEqual(['fresh']);
      expect(loader.state.resolveError).toBeNull();
      expect(loader.state.resolving).toBe(true);
      fresh.resolve({ paths: [[node('fresh')]], unresolved: [] });
      await current;
      stale.resolve({ paths: [[node('old')]], unresolved: [] });
      await old;
      expect(loader.state.resolveReady).toBe(true);
      expect(loader.state.keys).toEqual(['fresh']);
      expect(loader.state.entries.has('old')).toBe(false);
      expect(changes.at(-1)).toBe('["fresh"]');
    },
  );
  it.each([
    { paths: [], unresolved: [] },
    { paths: [[node('other')]], unresolved: [] },
    { paths: [[node('selected')]], unresolved: ['selected'] },
    { paths: [[node('selected')], [node('selected')]], unresolved: [] },
    { paths: [[node('leaf'), node('selected')]], unresolved: [] },
    { paths: [[node('selected', true), node('selected')]], unresolved: [] },
    {
      paths: [Array.from({ length: 33 }, (_, i) => node(i === 32 ? 'selected' : i, true))],
      unresolved: [],
    },
    { paths: [[node('selected')]], unresolved: [], token: 'domain' },
  ])(
    'rejects incomplete, ambiguous, cyclic or oversized path responses atomically: %j',
    async (response) => {
      const loader = new TreeDataLoader();
      loader.setSource(
        { identity: 'one', adapter: adapter({ resolve: async () => response }) },
        'en-US',
      );
      await loader.resolve(['selected']);
      expect(loader.state.resolveError).toBe('response');
      expect(loader.state.resolveReady).toBe(false);
      expect(loader.state.entries.size).toBe(0);
    },
  );
});
