import { isLocalizedText } from './localization.js';
import type { LocalizedText } from './localization.js';
export type ChoiceValue = string | number;
export type ChoiceOption = {
  value: ChoiceValue;
  label: string | LocalizedText;
  disabled?: boolean;
};
/** Empty string/null are reserved for no selection; numeric zero is a valid option. */
export function isChoiceOptions(value: unknown): value is ChoiceOption[] {
  if (!Array.isArray(value) || value.length > 1000) return false;
  const keys = new Set<ChoiceValue>();
  return value.every((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const option = entry as Record<string, unknown>;
    if (Object.keys(option).some((key) => !['value', 'label', 'disabled'].includes(key)))
      return false;
    const key = option['value'];
    if (
      !(typeof key === 'string' && key.length > 0 && key.length <= 4096) &&
      !(typeof key === 'number' && Number.isFinite(key))
    )
      return false;
    if (keys.has(key as ChoiceValue)) return false;
    keys.add(key as ChoiceValue);
    return (
      ((typeof option['label'] === 'string' && option['label'].length <= 4096) ||
        isLocalizedText(option['label'])) &&
      (option['disabled'] === undefined || typeof option['disabled'] === 'boolean')
    );
  });
}
