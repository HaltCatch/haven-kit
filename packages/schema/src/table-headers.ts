import { isLocalizedText } from './localization.js';
import type { LocalizedText } from './localization.js';
import { isTableColumns } from './table.js';

/** Presentation hierarchy only; flat TableColumn definitions retain data, editing and query ownership. */
export type TableHeaderLayout = readonly (
  string | { id: string; header: string | LocalizedText; children: TableHeaderLayout }
)[];

const identifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(value);

function properties(value: unknown, limit: number): Record<string, unknown> | undefined {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Object.getOwnPropertySymbols(value).length
  )
    return undefined;
  const descriptors = Object.getOwnPropertyDescriptors(value),
    entries = Object.entries(descriptors);
  if (
    entries.length > limit ||
    entries.some(([, descriptor]) => !descriptor.enumerable || !('value' in descriptor))
  )
    return undefined;
  return Object.fromEntries(entries.map(([key, descriptor]) => [key, descriptor.value]));
}

function label(value: unknown): boolean {
  if (typeof value === 'string') return value.length <= 4096;
  const fields = properties(value, 2),
    translations = fields && properties(fields['translations'], 50);
  return !!fields && !!translations && isLocalizedText({ ...fields, translations });
}

function items(value: unknown): readonly unknown[] | undefined {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length === 0 ||
    value.length > 200 ||
    Object.getOwnPropertySymbols(value).length
  )
    return undefined;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.keys(descriptors).length !== value.length + 1) return undefined;
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = descriptors[String(index)];
    if (!descriptor?.enumerable || !('value' in descriptor)) return undefined;
    result.push(descriptor.value);
  }
  return result;
}

/** Every leaf appears exactly once. Eight total header levels include the final leaf row. */
export function isTableHeaderLayout(value: unknown, columns: unknown): value is TableHeaderLayout {
  try {
    if (!isTableColumns(columns)) return false;
    const leaves = new Set(columns.map((column) => column.id)),
      groups = new Set<string>(),
      seen = new WeakSet<object>(),
      pending = [{ value, depth: 1 }];
    let count = 0;
    while (pending.length) {
      const current = pending.pop()!,
        layout = items(current.value);
      if (!layout || current.depth > 8 || seen.has(current.value as object)) return false;
      seen.add(current.value as object);
      count += layout.length;
      if (count > 200) return false;
      for (const entry of layout) {
        if (typeof entry === 'string') {
          if (!leaves.delete(entry)) return false;
          continue;
        }
        const group = properties(entry, 3);
        if (
          !group ||
          Object.keys(group).length !== 3 ||
          Object.keys(group).some((key) => !['id', 'header', 'children'].includes(key)) ||
          !identifier(group['id']) ||
          groups.has(group['id']) ||
          !label(group['header']) ||
          seen.has(entry as object)
        )
          return false;
        seen.add(entry as object);
        groups.add(group['id']);
        if (groups.size > 100) return false;
        pending.push({ value: group['children'], depth: current.depth + 1 });
      }
    }
    return leaves.size === 0;
  } catch {
    return false;
  }
}
