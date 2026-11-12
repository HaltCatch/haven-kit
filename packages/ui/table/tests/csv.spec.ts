import { describe, expect, it, vi } from 'vitest';
import { encodeHavenCsvCell } from '../csv';
describe('CSV text boundaries', () => {
  it('quotes every field, escapes quotes and preserves comma, line breaks and Unicode', () => {
    expect(encodeHavenCsvCell('A,"B"\nC\r\n中文')).toBe('"A,""B""\nC\r\n中文"');
    expect(encodeHavenCsvCell(-12)).toBe('"-12"');
    expect(encodeHavenCsvCell(false)).toBe('"false"');
    expect(encodeHavenCsvCell(null)).toBe('""');
    expect(encodeHavenCsvCell(undefined)).toBe('""');
  });
  it('neutralizes formulas including whitespace, controls, full-width and Unicode compatibility forms', () => {
    for (const value of [
      '=1+1',
      '+cmd',
      '-12',
      '@SUM(A1)',
      '  =1',
      '\tname',
      '\rname',
      '\nname',
      '\0name',
      '\uFEFF=1',
      '\u200b@A1',
      '＝1',
      '＋1',
      '－1',
      '＠A1',
      '﹦1',
      '﹢1',
      '﹣1',
      '−1',
    ]) {
      expect(encodeHavenCsvCell(value)).toBe('"\'' + value + '"');
    }
    expect(encodeHavenCsvCell('safe,=formula')).toBe('"safe,=formula"');
  });
  it('requires explicit bounded JSON conversion and never calls data accessors', () => {
    const value = { nested: ['中文', 0, false] };
    expect(() => encodeHavenCsvCell(value)).toThrow();
    expect(encodeHavenCsvCell(value, 'json')).toBe('"{""nested"":[""中文"",0,false]}"');
    const getter = vi.fn(() => '=1');
    const accessor = Object.defineProperty({}, 'value', { enumerable: true, get: getter });
    expect(() => encodeHavenCsvCell(accessor, 'json')).toThrow();
    expect(getter).not.toHaveBeenCalled();
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    for (const invalid of [cyclic, new Date(), NaN, Infinity, () => 'a'])
      expect(() => encodeHavenCsvCell(invalid, 'json')).toThrow();
  });
});
