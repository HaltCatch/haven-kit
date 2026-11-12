import { describe, expect, it } from 'vitest';
import {
  filterTree,
  indexTree,
  isTreeNodes,
  isTreeValue,
  treePath,
} from '../packages/schema/src/tree.js';
import type { TreeNode } from '../packages/schema/src/tree.js';
const nodes: TreeNode[] = [{ key: 0, label: 'Root', children: [{ key: '0', label: 'Child' }] }];
describe('local hierarchy contract', () => {
  it('preserves typed zero keys and independent immutable snapshots', () => {
    const source = structuredClone(nodes),
      index = indexTree(source)!;
    expect(index.entries.size).toBe(2);
    expect(treePath(index, '0').map((node) => node.key)).toEqual([0, '0']);
    source[0]!.label = 'Changed';
    expect(index.roots[0]!.label).toBe('Root');
    expect(Object.isFrozen(index.roots[0])).toBe(true);
    expect(isTreeValue(0, nodes)).toBe(true);
    expect(isTreeValue(0, nodes, true)).toBe(false);
    expect(isTreeValue('0', nodes, true)).toBe(true);
    expect(isTreeValue('missing', nodes)).toBe(false);
  });
  it('rejects duplicate and cyclic nodes, unsupported payloads and bounded resource abuse', () => {
    const cycle: TreeNode = { key: 'cycle', label: 'Cycle' };
    cycle.children = [cycle];
    for (const value of [
      [cycle],
      [...nodes, nodes[0]],
      [{ key: NaN, label: 'Invalid' }],
      [{ key: '', label: 'Invalid' }],
      [{ key: 'a', label: 'A', url: '/business' }],
      Array.from({ length: 5001 }, (_, key) => ({ key, label: 'x' })),
    ])
      expect(isTreeNodes(value)).toBe(false);
    let deep: TreeNode = { key: 33, label: 'Deep' };
    for (let key = 32; key > 0; key--) deep = { key, label: 'Deep', children: [deep] };
    expect(isTreeNodes([deep])).toBe(false);
  });
  it('inherits disabled state without treating existing locked values as missing', () => {
    const source = [{ ...nodes[0]!, disabled: true }];
    expect(indexTree(source)!.entries.get('0')!.disabled).toBe(true);
    expect(isTreeValue('0', source, true)).toBe(true);
  });
  it('filters by localized display labels while retaining the matching ancestry', () => {
    const index = indexTree(nodes)!;
    expect(filterTree(index, 'child', (node) => String(node.label))[0]!.children![0]!.key).toBe(
      '0',
    );
    expect(filterTree(index, 'missing', (node) => String(node.label))).toEqual([]);
    expect(filterTree(index, '', (node) => String(node.label))).toBe(index.roots);
  });
});
