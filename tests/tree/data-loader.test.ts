import { describe, expect, it, vi } from 'vitest';
import type { RemoteTreeNode, TreeKey } from '@haven/schema';
import { TreeDataLoader } from '../../packages/runtime/src/tree/data.js';
import type { TreeDataState, TreeResolution } from '../../packages/runtime/src/tree/types.js';
import { adapter, deferred, node } from './data-support.js';

describe('lazy tree request ownership', () => {
  it('loads roots explicitly, keeps sibling lanes parallel, typed keys distinct and successes cached', async () => {
    const a = deferred<RemoteTreeNode[]>(),
      b = deferred<RemoteTreeNode[]>();
    const children = vi.fn(async (key: TreeKey | null) =>
      key === null ? [node(0, true), node('0', true)] : key === 0 ? a.promise : b.promise,
    );
    const loader = new TreeDataLoader();
    loader.setSource({ identity: 'one', adapter: adapter({ children }) }, 'en-US');
    expect(children).not.toHaveBeenCalled();
    await loader.load(null);
    const first = loader.load(0),
      second = loader.load('0');
    b.resolve([node('b')]);
    await second;
    expect(loader.state.branches.get(0)?.status).toBe('loading');
    a.resolve([node('a')]);
    await first;
    expect(loader.state.entries.get('a')?.path).toEqual([0, 'a']);
    expect(loader.state.entries.get('b')?.path).toEqual(['0', 'b']);
    await loader.load(0);
    expect(children).toHaveBeenCalledTimes(3);
  });
  it('collapse cancels the branch and descendant requests, ignores late replies and retains sibling cache', async () => {
    const waiting = deferred<RemoteTreeNode[]>(),
      sibling = deferred<RemoteTreeNode[]>();
    const signals = new Map<TreeKey | null, AbortSignal>();
    const source = adapter({
      children: async (key, { signal }) => {
        signals.set(key, signal);
        if (key === null) return [node('a', true), node('b', true)];
        if (key === 'a') return [node('a1', true)];
        return key === 'a1' ? waiting.promise : sibling.promise;
      },
    });
    const loader = new TreeDataLoader();
    loader.setSource({ identity: 'one', adapter: source }, 'en-US');
    await loader.load(null);
    await loader.load('a');
    const child = loader.load('a1'),
      other = loader.load('b');
    loader.cancel('a');
    expect(signals.get('a1')?.aborted).toBe(true);
    expect(signals.get('b')?.aborted).toBe(false);
    expect(loader.state.branches.get('a')?.status).toBe('ready');
    expect(loader.state.branches.has('a1')).toBe(false);
    waiting.resolve([node('stale')]);
    sibling.resolve([node('good')]);
    await Promise.all([child, other]);
    expect(loader.state.entries.has('stale')).toBe(false);
    expect(loader.state.entries.has('good')).toBe(true);
  });
  it('changes source, adapter and locale atomically and cancels both read and selection lanes', async () => {
    const roots = deferred<RemoteTreeNode[]>(),
      selection = deferred<TreeResolution>();
    const signals: AbortSignal[] = [];
    const source = adapter({
      children: async (_key, context) => {
        signals.push(context.signal);
        return roots.promise;
      },
      resolve: async (_keys, context) => {
        signals.push(context.signal);
        return selection.promise;
      },
    });
    const loader = new TreeDataLoader();
    loader.setSource({ identity: 'one', adapter: source }, 'en-US');
    const work = [loader.load(null), loader.resolve(['old'])];
    loader.setSource({ identity: 'one', adapter: source }, 'zh-CN');
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    roots.resolve([node('old')]);
    selection.resolve({ paths: [[node('old')]], unresolved: [] });
    await Promise.all(work);
    expect(loader.state.entries.size).toBe(0);
    expect(loader.state.resolveReady).toBe(false);
    loader.setSource(
      { identity: 'one', adapter: adapter({ children: async () => [node('new')] }) },
      'zh-CN',
    );
    await loader.load(null);
    expect([...loader.state.entries.keys()]).toEqual(['new']);
  });
  it('preserves same-source caches, retries failed branches, and avoids calls for leaves or missing parents', async () => {
    let failed = true;
    const children = vi.fn(async (key: TreeKey | null) => {
      if (key === null) return [node('p', true), node('leaf')];
      if (failed) throw new Error('Private endpoint and token');
      return [node('child')];
    });
    const source = { identity: 'one', adapter: adapter({ children }) },
      loader = new TreeDataLoader();
    loader.setSource(source, 'en-US');
    await loader.load(null);
    await loader.load('p');
    expect(loader.state.branches.get('p')?.error).toBe('adapter');
    expect(JSON.stringify(loader.state.branches.get('p'))).not.toContain('Private');
    loader.setSource({ ...source }, 'en-US');
    failed = false;
    await loader.load('p');
    await loader.load('leaf');
    await loader.load('missing');
    expect(loader.state.branches.get('p')?.status).toBe('ready');
    expect(children).toHaveBeenCalledTimes(3);
  });
  it('never calls a replaced adapter when the loading notification synchronously changes owner', async () => {
    const old = adapter({ children: vi.fn(async () => [node('stale')]) }),
      next = adapter({ children: vi.fn(async () => [node('new')]) });
    const loader = new TreeDataLoader((state) => {
      if (state.branches.get(null)?.status === 'loading')
        loader.setSource({ identity: 'next', adapter: next }, 'en-US');
    });
    loader.setSource({ identity: 'old', adapter: old }, 'en-US');
    await loader.load(null);
    expect(old.children).not.toHaveBeenCalled();
    expect(loader.state.entries.size).toBe(0);
  });
  it('does not lose a new owner created synchronously by an old transport abort handler', async () => {
    const pending = deferred<RemoteTreeNode[]>(),
      fresh = adapter({ children: async () => [node('fresh')] });
    const loader = new TreeDataLoader();
    const old = adapter({
      children: async (_key, { signal }) => {
        signal.addEventListener('abort', () =>
          loader.setSource({ identity: 'fresh', adapter: fresh }, 'en-US'),
        );
        return pending.promise;
      },
    });
    loader.setSource({ identity: 'old', adapter: old }, 'en-US');
    const work = loader.load(null);
    loader.setSource({ identity: 'superseded', adapter: adapter() }, 'en-US');
    await loader.load(null);
    expect(loader.state.entries.has('fresh')).toBe(true);
    pending.resolve([node('stale')]);
    await work;
    expect(loader.state.entries.has('stale')).toBe(false);
  });
  it('dispose aborts live requests and never delivers later notifications', async () => {
    const pending = deferred<RemoteTreeNode[]>(),
      changes: TreeDataState[] = [];
    let signal!: AbortSignal;
    const loader = new TreeDataLoader((state) => changes.push(state));
    loader.setSource(
      {
        identity: 'one',
        adapter: adapter({
          children: async (_key, context) => {
            signal = context.signal;
            return pending.promise;
          },
        }),
      },
      'en-US',
    );
    const work = loader.load(null);
    loader.dispose();
    expect(signal.aborted).toBe(true);
    const count = changes.length;
    pending.resolve([node('late')]);
    await work;
    loader.setSource({ identity: 'next', adapter: adapter() }, 'en-US');
    loader.cancel(null);
    await loader.resolve([]);
    await loader.load(null);
    expect(changes.length).toBe(count);
  });
});
