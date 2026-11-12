import type { ComponentManifest } from './types.js';
export function isLocaleTag(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 100) return false;
  try {
    return Intl.getCanonicalLocales(value).length === 1;
  } catch {
    return false;
  }
}
export function isMultilingualLocales(value: unknown): value is string[] {
  if (!Array.isArray(value) || !value.length || value.length > 100 || !value.every(isLocaleTag))
    return false;
  return new Set(value.map((locale) => Intl.getCanonicalLocales(locale)[0])).size === value.length;
}
export function isMultilingualValue(value: unknown): value is Record<string, string> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
    Object.keys(value).length <= 100 &&
    Object.entries(value).every(([locale, text]) => isLocaleTag(locale) && typeof text === 'string')
  );
}
export const multilingualManifest: ComponentManifest = {
  kind: 'field.multilingual',
  version: 1,
  title: 'Multilingual value',
  container: false,
  binding: 'required',
  dataTypes: ['object'],
  events: ['change', 'blur'],
  properties: {
    label: { type: 'string', label: '标签', localizable: true },
    description: { type: 'string', label: '说明', localizable: true },
    readonly: { type: 'boolean', label: '只读' },
    locales: { type: 'array', label: '编辑语言' },
    maxLength: { type: 'number', label: '每种语言最大长度', minimum: 0 },
  },
};
