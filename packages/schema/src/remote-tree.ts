import { isLocalizedText } from './localization.js';
import type { LocalizedText } from './localization.js';
import { isTreeKey } from './tree.js';
import type { TreeKey } from './tree.js';

/** One remote record. An unloaded branch is explicitly different from a leaf. */
export interface RemoteTreeNode {
  key: TreeKey;
  label: string | LocalizedText;
  disabled?: boolean;
  hasChildren: boolean;
}

/** Shape validation; transports additionally snapshot responses before inspecting their contents. */
export function isRemoteTreeNodes(value: unknown): value is RemoteTreeNode[] {
  if (!Array.isArray(value) || value.length > 5000) return false;
  const keys = new Set<TreeKey>();
  for (const node of value) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
    const entry = node as Record<string, unknown>;
    if (
      Object.keys(entry).some(
        (key) => !['key', 'label', 'disabled', 'hasChildren'].includes(key),
      ) ||
      !isTreeKey(entry['key']) ||
      keys.has(entry['key']) ||
      !(
        (typeof entry['label'] === 'string' && entry['label'].length <= 4096) ||
        isLocalizedText(entry['label'])
      ) ||
      typeof entry['hasChildren'] !== 'boolean' ||
      (entry['disabled'] !== undefined && typeof entry['disabled'] !== 'boolean')
    )
      return false;
    keys.add(entry['key']);
  }
  return true;
}
