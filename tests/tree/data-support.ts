import type { RemoteTreeNode, TreeKey } from '@haven/schema';
import type { TreeDataAdapter } from '../../packages/runtime/src/tree/types.js';

export const node = (key: TreeKey, hasChildren = false, disabled?: boolean): RemoteTreeNode => ({
  key,
  label: String(key),
  hasChildren,
  ...(disabled === undefined ? {} : { disabled }),
});
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
export function adapter(change: Partial<TreeDataAdapter> = {}): TreeDataAdapter {
  return {
    children: async () => [],
    resolve: async (keys) => ({ paths: [], unresolved: keys }),
    ...change,
  };
}
