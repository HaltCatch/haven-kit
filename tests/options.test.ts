import { describe, expect, it } from 'vitest';
import { isChoiceOptions, validateDocument } from '@haven/schema';
import { document } from './fixtures.js';
describe('choice options contract', () => {
  it('preserves numeric zero and distinguishes numeric keys from string keys', () => {
    expect(
      isChoiceOptions([
        { value: 0, label: 'Zero' },
        { value: '0', label: 'String zero' },
      ]),
    ).toBe(true);
    expect(
      isChoiceOptions([
        { value: 'a', label: 'A' },
        { value: 'a', label: 'Other' },
      ]),
    ).toBe(false);
    expect(isChoiceOptions([{ value: '', label: 'Empty' }])).toBe(false);
    expect(isChoiceOptions([{ value: null, label: 'Null' }])).toBe(false);
    expect(isChoiceOptions([{ value: NaN, label: 'Invalid' }])).toBe(false);
    expect(isChoiceOptions([{ value: true, label: 'Boolean' }])).toBe(false);
  });
  it('checks localized labels, disabled flags and bounded option lists', () => {
    expect(
      isChoiceOptions([
        { value: 'a', label: { default: 'A', translations: { 'zh-CN': '甲' } }, disabled: true },
      ]),
    ).toBe(true);
    expect(isChoiceOptions([{ value: 'a', label: {}, disabled: true }])).toBe(false);
    expect(isChoiceOptions([{ value: 'a', label: 'A', disabled: 'false' }])).toBe(false);
    expect(isChoiceOptions([{ value: 'a', label: 'A', expression: 'code' }])).toBe(false);
    expect(
      isChoiceOptions(
        Array.from({ length: 1001 }, (_, value) => ({ value, label: String(value) })),
      ),
    ).toBe(false);
  });
  it('reports option defects on the component and checks the bound value type', () => {
    const model = document();
    model.ui.children![0]!.kind = 'field.select';
    model.ui.children![0]!.props = { options: [{ value: 0, label: 'Zero' }] };
    expect(validateDocument(model).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'options.type', nodeId: 'title' }),
    );
    model.ui.children![0]!.props = { options: [{ value: 'a', label: 'A' }] };
    expect(validateDocument(model).valid).toBe(true);
    model.ui.children![0]!.props = {
      options: [
        { value: 'a', label: 'A' },
        { value: 'a', label: 'B' },
      ],
    };
    expect(validateDocument(model).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'options.invalid', nodeId: 'title' }),
    );
  });
});
