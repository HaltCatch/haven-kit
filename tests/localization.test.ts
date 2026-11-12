import { readFileSync } from 'node:fs';
import { document } from './fixtures.js';
import { describe, expect, it } from 'vitest';
import { isLocalizedText, localizeText, validateDocument } from '@haven/schema';
describe('localized model captions', () => {
  it('supports exact locale, base language and explicit default without changing plain data', () => {
    const text = {
      default: '默认',
      translations: { en: 'Base', 'en-US': 'US', 'zh-Hant': '繁體' },
    };
    expect(localizeText(text, 'en-us')).toBe('US');
    expect(localizeText(text, 'en-GB', ['en'])).toBe('Base');
    expect(localizeText(text, 'zh-Hant-TW', ['zh-Hant'])).toBe('繁體');
    expect(localizeText(text, 'de-DE')).toBe('默认');
    expect(localizeText('Plain caption', 'zh-CN')).toBe('Plain caption');
  });
  it('accepts captions but refuses translated resource identifiers', () => {
    const model = document();
    const caption = { default: 'Title', translations: { 'zh-CN': '标题' } };
    model.ui.children![0]!.props = { label: caption };
    expect(validateDocument(model).valid).toBe(true);
    model.ui.children![0]!.kind = 'field.select';
    model.ui.children![0]!.props = { resource: caption };
    expect(validateDocument(model).diagnostics.some((item) => item.code === 'property.value')).toBe(
      true,
    );
  });
  it('rejects malformed, ambiguous and oversized translation resources', () => {
    expect(isLocalizedText({ default: 'A', translations: { not_a_locale: 'B' } })).toBe(false);
    expect(isLocalizedText({ default: 'A', translations: { 'en-us': 'B', 'en-US': 'C' } })).toBe(
      false,
    );
    expect(isLocalizedText({ default: 'A', translations: { en: 1 } })).toBe(false);
    expect(isLocalizedText({ default: 'A', translations: {}, execute: 'code' })).toBe(false);
    expect(localizeText({ default: 'A', translations: {} }, 'bad_locale')).toBe('A');
  });
});

describe('packaged translation resources', () => {
  it('keeps both locale catalogs complete and aligned', () => {
    const read = (locale: string) =>
      JSON.parse(
        readFileSync(
          new URL(`../packages/ui/i18n/locales/${locale}.json`, import.meta.url),
          'utf8',
        ),
      ) as Record<string, string>;
    const en = read('en-US'),
      zh = read('zh-CN');
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
    expect([...Object.values(en), ...Object.values(zh)].every((text) => text.length > 0)).toBe(
      true,
    );
  });
});
