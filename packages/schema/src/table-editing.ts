import { isLocalizedText } from './localization.js';
import type { LocalizedText } from './localization.js';
import { isTableRendererId, isTableRendererParams } from './table.js';
import type { JsonObject } from './types.js';

export interface TableEditorRef {
  readonly id: string;
  readonly params?: JsonObject;
}
export type TableTooltip =
  | { readonly text: string | LocalizedText }
  | { readonly provider: string; readonly params?: JsonObject };
export interface TableRowAction {
  readonly id: string;
  readonly label: string | LocalizedText;
  readonly kind: 'read' | 'write';
  readonly actions: readonly string[];
}
export function isTableEditor(value: unknown): value is TableEditorRef {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return (
    Object.keys(entry).every((key) => ['id', 'params'].includes(key)) &&
    isTableRendererId(entry['id']) &&
    (entry['params'] === undefined || isTableRendererParams(entry['params']))
  );
}
const text = (value: unknown) =>
  (typeof value === 'string' && value.length <= 4096) || isLocalizedText(value);
export function isTableTooltip(value: unknown): value is TableTooltip {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return 'text' in entry
    ? Object.keys(entry).length === 1 && text(entry['text'])
    : Object.keys(entry).every((key) => ['provider', 'params'].includes(key)) &&
        isTableRendererId(entry['provider']) &&
        (entry['params'] === undefined || isTableRendererParams(entry['params']));
}
export function isTableRowActions(value: unknown): value is readonly TableRowAction[] {
  if (!Array.isArray(value) || value.length > 32) return false;
  const ids = new Set<string>();
  return value.every((item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const entry = item as Record<string, unknown>,
      id = entry['id'];
    if (!isTableRendererId(id) || ids.has(id)) return false;
    ids.add(id);
    return (
      Object.keys(entry).every((key) => ['id', 'label', 'kind', 'actions'].includes(key)) &&
      text(entry['label']) &&
      (entry['kind'] === 'read' || entry['kind'] === 'write') &&
      Array.isArray(entry['actions']) &&
      entry['actions'].length > 0 &&
      entry['actions'].length <= 16 &&
      entry['actions'].every(isTableRendererId) &&
      new Set(entry['actions']).size === entry['actions'].length
    );
  });
}
