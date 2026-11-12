import { isRemoteTreeNodes, isTreeSelection } from '@haven/schema';
import type { RemoteTreeNode, TreeKey } from '@haven/schema';
import { snapshotJson } from '../json-snapshot.js';
import type { TreeResolution } from './types.js';

export class InvalidTreeResponse extends Error {}

function copy(value: unknown): unknown {
  try {
    return snapshotJson(value);
  } catch {
    throw new InvalidTreeResponse();
  }
}
export function copyTreeNodes(value: unknown): readonly RemoteTreeNode[] {
  const nodes = copy(value);
  if (!isRemoteTreeNodes(nodes)) throw new InvalidTreeResponse();
  return nodes;
}
export function copyTreeResolution(value: unknown, requested: readonly TreeKey[]): TreeResolution {
  const result = copy(value);
  if (!result || typeof result !== 'object' || Array.isArray(result))
    throw new InvalidTreeResponse();
  const record = result as Record<string, unknown>,
    paths = record['paths'],
    unresolved = record['unresolved'];
  if (
    Object.keys(record).some((key) => !['paths', 'unresolved'].includes(key)) ||
    !Array.isArray(paths) ||
    paths.length > 5000 ||
    !isTreeSelection(unresolved)
  )
    throw new InvalidTreeResponse();
  const remaining = new Set(requested);
  for (const path of paths) {
    if (!isRemoteTreeNodes(path) || !path.length || path.length > 32)
      throw new InvalidTreeResponse();
    if (!remaining.delete(path.at(-1)!.key)) throw new InvalidTreeResponse();
    if (path.slice(0, -1).some((node) => !node.hasChildren)) throw new InvalidTreeResponse();
  }
  for (const key of unresolved) if (!remaining.delete(key)) throw new InvalidTreeResponse();
  if (remaining.size) throw new InvalidTreeResponse();
  return { paths: paths as RemoteTreeNode[][], unresolved };
}
