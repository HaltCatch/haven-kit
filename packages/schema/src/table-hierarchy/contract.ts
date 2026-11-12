import { isTablePointer } from '../table.js';
import { isTableRowKey } from '../table-view.js';
import type { TableRowKey } from '../table-view.js';

/** A complete flat local collection, with an explicit typed parent relation and root marker. */
export interface TableHierarchy {
  readonly parentPath: string;
  readonly rootValue: TableRowKey | null;
  readonly filterMode?: 'retain-ancestors' | 'prune-branches';
  readonly pagination?: 'root-rows' | 'visible-rows';
}

export function isTableHierarchy(value: unknown): value is TableHierarchy {
  try {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Object.getOwnPropertySymbols(value).length
    )
      return false;
    const descriptors = Object.getOwnPropertyDescriptors(value),
      entries = Object.entries(descriptors);
    if (
      entries.length < 2 ||
      entries.length > 4 ||
      entries.some(
        ([key, descriptor]) =>
          !['parentPath', 'rootValue', 'filterMode', 'pagination'].includes(key) ||
          !descriptor.enumerable ||
          !('value' in descriptor),
      )
    )
      return false;
    const config = Object.fromEntries(entries.map(([key, descriptor]) => [key, descriptor.value]));
    const marker = config['rootValue'];
    return (
      isTablePointer(config['parentPath']) &&
      Object.hasOwn(config, 'rootValue') &&
      (marker === null ||
        (typeof marker === 'string' && marker.length <= 4096) ||
        (typeof marker === 'number' && Number.isFinite(marker))) &&
      (config['filterMode'] === undefined ||
        ['retain-ancestors', 'prune-branches'].includes(config['filterMode'])) &&
      (config['pagination'] === undefined ||
        ['root-rows', 'visible-rows'].includes(config['pagination']))
    );
  } catch {
    return false;
  }
}

/** Public expansion uses typed row keys, never engine IDs, indexes, sparse or unbounded arrays. */
export function isTableExpandedRowKeys(value: unknown): value is TableRowKey[] {
  try {
    if (
      !Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Array.prototype ||
      value.length > 5000 ||
      Object.getOwnPropertySymbols(value).length
    )
      return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.keys(descriptors).length !== value.length + 1) return false;
    const keys = new Set<TableRowKey>();
    for (let at = 0; at < value.length; at++) {
      const descriptor = descriptors[String(at)];
      if (
        !descriptor?.enumerable ||
        !('value' in descriptor) ||
        !isTableRowKey(descriptor.value) ||
        keys.has(descriptor.value)
      )
        return false;
      keys.add(descriptor.value);
    }
    return true;
  } catch {
    return false;
  }
}
