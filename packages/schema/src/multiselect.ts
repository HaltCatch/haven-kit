import type { ChoiceOption, ChoiceValue } from './options.js';

/** An empty array is unselected. Disabled options can remain valid existing selections. */
export function isMultiChoiceValue(
  value: unknown,
  options?: readonly ChoiceOption[],
): value is ChoiceValue[] {
  if (!Array.isArray(value) || value.length > 1000) return false;
  const selected = new Set<ChoiceValue>();
  const known = options && new Set(options.map((option) => option.value));
  for (const entry of value) {
    if (
      !(typeof entry === 'string' && entry.length > 0 && entry.length <= 4096) &&
      !(typeof entry === 'number' && Number.isFinite(entry))
    )
      return false;
    if (selected.has(entry as ChoiceValue) || (known && !known.has(entry as ChoiceValue)))
      return false;
    selected.add(entry as ChoiceValue);
  }
  return true;
}
