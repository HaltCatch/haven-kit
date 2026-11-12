import { describe, expect, it } from 'vitest';
import { isMultiChoiceValue } from '../packages/schema/src/multiselect.js';

describe('multiselect value contract', () => {
  it('uses [] for empty selection and preserves primitive value types', () => {
    expect(isMultiChoiceValue([])).toBe(true);
    expect(isMultiChoiceValue([0, '0', 'a;b'])).toBe(true);
    expect(isMultiChoiceValue(null)).toBe(false);
    expect(isMultiChoiceValue('a;b')).toBe(false);
  });
  it('rejects duplicate, malformed and oversized values without changing input', () => {
    for (const value of [
      [0, 0],
      ['a', 'a'],
      [''],
      [NaN],
      [Infinity],
      [null],
      [true],
      [{}],
      [[]],
      ['a'.repeat(4097)],
      Array.from({ length: 1001 }, (_, index) => index),
    ])
      expect(isMultiChoiceValue(value)).toBe(false);
    const input = Object.freeze([0, 'a']);
    expect(isMultiChoiceValue(input)).toBe(true);
    expect(input).toEqual([0, 'a']);
  });
  it('checks optional membership but permits an existing disabled selection', () => {
    const options = [
      { value: 0, label: 'Zero' },
      { value: 'locked', label: 'Locked', disabled: true },
    ];
    expect(isMultiChoiceValue([0, 'locked'], options)).toBe(true);
    expect(isMultiChoiceValue(['0'], options)).toBe(false);
    expect(isMultiChoiceValue(['stale'], options)).toBe(false);
    expect(isMultiChoiceValue([], [])).toBe(true);
  });
});
