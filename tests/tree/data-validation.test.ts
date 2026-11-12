import { describe, expect, it, vi } from 'vitest';
import type { RemoteTreeNode } from '@haven/schema';
import { TreeDataLoader } from '../../packages/runtime/src/tree/data.js';
import { adapter, node } from './data-support.js';

describe('lazy tree cache and transport boundaries', () => {
  it('rejects duplicate typed keys, executable descriptors, class instances and cyclic transport values', async () => {
    const getter = vi.fn(() => 'secret');
    const withGetter = { ...node('a') };
    Object.defineProperty(withGetter, 'label', { enumerable: true, get: getter });
    class Domain {
      key = 'a';
      label = 'A';
      hasChildren = false;
    }
    const cycle = { ...node('a'), extra: null as unknown };
    cycle.extra = cycle;
    for (const response of [
      [node(0), node(0)],
      [withGetter],
      [new Domain()],
      [cycle],
      [{ ...node('a'), hasChildren: undefined }],
      [{ ...node('a'), payload: 'business' }],
      [node(Number.POSITIVE_INFINITY)],
    ]) {
      const loader = new TreeDataLoader();
      loader.setSource(
        {
          identity: 'one',
          adapter: adapter({ children: async () => response as RemoteTreeNode[] }),
        },
        'en-US',
      );
      await loader.load(null);
      expect(loader.state.branches.get(null)?.error).toBe('response');
      expect(loader.state.entries.size).toBe(0);
    }
    expect(getter).not.toHaveBeenCalled();
  });
  it('takes independent frozen copies before accepting adapter output', async () => {
    const response = [
      { key: 'a', label: { default: 'A', translations: { 'en-US': 'A' } }, hasChildren: false },
    ];
    const loader = new TreeDataLoader();
    loader.setSource(
      { identity: 'one', adapter: adapter({ children: async () => response }) },
      'en-US',
    );
    await loader.load(null);
    response[0]!.label.translations['en-US'] = 'mutated';
    const accepted = loader.state.entries.get('a')!.node;
    expect(accepted.label).toEqual({ default: 'A', translations: { 'en-US': 'A' } });
    expect(Object.isFrozen(accepted)).toBe(true);
    expect(Object.isFrozen(accepted.label)).toBe(true);
    expect(Object.isFrozen(loader.state.entries.get('a')?.path)).toBe(true);
  });
  it('compares record semantics rather than object key order or omitted false flags', async () => {
    const original: RemoteTreeNode = {
      key: 'a',
      label: { default: 'A', translations: { 'en-US': 'A', 'zh-CN': '甲' } },
      hasChildren: false,
    };
    const equal: RemoteTreeNode = {
      disabled: false,
      hasChildren: false,
      label: { translations: { 'zh-CN': '甲', 'en-US': 'A' }, default: 'A' },
      key: 'a',
    };
    const loader = new TreeDataLoader();
    loader.setSource(
      {
        identity: 'one',
        adapter: adapter({
          children: async () => [original],
          resolve: async () => ({ paths: [[equal]], unresolved: [] }),
        }),
      },
      'en-US',
    );
    await loader.load(null);
    const accepted = loader.state.entries.get('a')!.node;
    await loader.resolve(['a']);
    expect(loader.state.resolveReady).toBe(true);
    expect(loader.state.entries.get('a')?.node).toBe(accepted);
  });
  it('rejects reparenting, changed metadata and contradictory complete branches without disturbing cached records', async () => {
    let response = [[node('a', true), node('child')]];
    const source = adapter({
      children: async (key) =>
        key === null ? [node('a', true), node('b', true)] : [node('child')],
      resolve: async () => ({ paths: response, unresolved: [] }),
    });
    const loader = new TreeDataLoader();
    loader.setSource({ identity: 'one', adapter: source }, 'en-US');
    await loader.load(null);
    await loader.load('a');
    const original = loader.state.entries.get('child');
    response = [[node('b', true), node('child')]];
    await loader.resolve(['child']);
    expect(loader.state.resolveError).toBe('response');
    expect(loader.state.entries.get('child')).toBe(original);
    response = [[node('a', true), { ...node('child'), label: 'Changed without revision' }]];
    await loader.resolve(['child']);
    expect(loader.state.resolveError).toBe('response');
    response = [[node('new-root', true), node('child')]];
    await loader.resolve(['child']);
    expect(loader.state.entries.has('new-root')).toBe(false);
    expect(loader.state.entries.get('child')).toBe(original);
  });
  it('requires a later complete branch to contain records learned from an earlier selection path', async () => {
    const source = adapter({
      children: async () => [],
      resolve: async () => ({ paths: [[node('root', true), node('selected')]], unresolved: [] }),
    });
    const loader = new TreeDataLoader();
    loader.setSource({ identity: 'one', adapter: source }, 'en-US');
    await loader.resolve(['selected']);
    await loader.load(null);
    expect(loader.state.branches.get(null)?.error).toBe('response');
    expect(loader.state.entries.get('selected')?.path).toEqual(['root', 'selected']);
  });
  it('bounds the cumulative cache rather than just each branch response', async () => {
    const roots = Array.from({ length: 2501 }, (_, i) => node(`parent-${i}`, true));
    const source = adapter({
      children: async (key) =>
        key === null ? roots : Array.from({ length: 2500 }, (_, i) => node(`child-${i}`)),
    });
    const loader = new TreeDataLoader();
    loader.setSource({ identity: 'one', adapter: source }, 'en-US');
    await loader.load(null);
    await loader.load('parent-0');
    expect(loader.state.branches.get('parent-0')?.error).toBe('response');
    expect(loader.state.entries.size).toBe(2501);
    expect(loader.state.entries.has('child-0')).toBe(false);
  });
  it('bounds cumulative cache text and path depth across individually valid responses', async () => {
    const roots = Array.from({ length: 1000 }, (_, i) => ({
      ...node(i, true),
      label: 'x'.repeat(3000),
    }));
    const loader = new TreeDataLoader();
    loader.setSource(
      {
        identity: 'text',
        adapter: adapter({
          children: async (parent) =>
            parent === null
              ? roots
              : Array.from({ length: 1000 }, (_, i) => ({
                  ...node(`child-${i}`),
                  label: 'x'.repeat(3000),
                })),
        }),
      },
      'en-US',
    );
    await loader.load(null);
    await loader.load(0);
    expect(loader.state.branches.get(0)?.error).toBe('response');
    expect(loader.state.entries.size).toBe(1000);
    const deep = new TreeDataLoader();
    deep.setSource(
      {
        identity: 'depth',
        adapter: adapter({
          children: async (parent) => [node(parent === null ? 0 : Number(parent) + 1, true)],
        }),
      },
      'en-US',
    );
    await deep.load(null);
    for (let i = 0; i < 32; i++) await deep.load(i);
    expect(deep.state.entries.size).toBe(32);
    expect(deep.state.branches.get(31)?.error).toBe('response');
  });
});
