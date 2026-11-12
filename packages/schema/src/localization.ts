export type LocalizedText = { default: string; translations: Record<string, string> };

export function isLocalizedText(value: unknown): value is LocalizedText {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const object = value as Record<string, unknown>;
  if (
    Object.keys(object).length !== 2 ||
    typeof object['default'] !== 'string' ||
    object['default'].length > 4096
  )
    return false;
  const translations = object['translations'];
  if (translations === null || typeof translations !== 'object' || Array.isArray(translations))
    return false;
  const entries = Object.entries(translations);
  if (
    entries.length > 50 ||
    entries.some(
      ([locale, text]) => locale.length > 40 || typeof text !== 'string' || text.length > 4096,
    )
  )
    return false;
  try {
    return Intl.getCanonicalLocales(entries.map(([locale]) => locale)).length === entries.length;
  } catch {
    return false;
  }
}
/** UI captions are localizable; bound user data is deliberately not translated. */
export function localizeText(
  value: unknown,
  locale: string,
  fallbackLocales: readonly string[] = [],
): string {
  if (typeof value === 'string') return value;
  if (!isLocalizedText(value)) return '';
  const translations = new Map(
    Object.entries(value.translations).map(([key, text]) => [
      Intl.getCanonicalLocales(key)[0],
      text,
    ]),
  );
  for (const candidate of [locale, ...fallbackLocales]) {
    try {
      const key = Intl.getCanonicalLocales(candidate)[0];
      const translated = translations.get(key);
      if (translated !== undefined) return translated;
    } catch {
      /* Invalid host locale cannot alter the model's explicit default. */
    }
  }
  return value.default;
}
