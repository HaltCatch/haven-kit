import { expect, it } from 'vitest';
import { validateDocument } from '@haven/schema';
import type { FieldValidation } from '@haven/schema';
import { isValidationResult, validationSnapshot } from '@haven/runtime';
import { document } from './fixtures.js';
const compare: FieldValidation = {
  id: 'same',
  type: 'compare',
  operator: 'eq',
  other: { scope: 'root', path: '/title' },
  message: { default: 'Match', translations: { 'zh-CN': '必须一致' } },
};
function withRule(rule: unknown) {
  const doc = document();
  doc.ui.children![0]!.validators = [rule as FieldValidation];
  return doc;
}
it('accepts finite typed scalar and named asynchronous validators', () => {
  expect(validateDocument(withRule(compare)).valid).toBe(true);
  const doc = withRule({
    id: 'remote',
    type: 'async',
    resource: 'check',
    dependencies: { quantity: { scope: 'root', path: '/quantity' } },
    debounceMs: 200,
    message: 'Rejected',
  });
  doc.resources['check'] = { type: 'validation', adapter: 'host.check' };
  expect(validateDocument(doc).valid).toBe(true);
});
it('rejects unknown properties, executable/event inputs, unbounded debounce and duplicate identifiers', () => {
  for (const rule of [
    { ...compare, script: 'x' },
    { ...compare, other: { scope: 'event', path: '/title' } },
    { id: 'remote', type: 'async', resource: 'check', debounceMs: 2001, message: 'x' },
  ])
    expect(validateDocument(withRule(rule)).valid).toBe(false);
  const doc = withRule(compare);
  doc.ui.children![0]!.validators!.push(compare);
  expect(validateDocument(doc).diagnostics.some((d) => d.code === 'validation.binding')).toBe(true);
  doc.ui.children![0]!.validators = Array.from({ length: 17 }, (_, id) => ({
    ...compare,
    id: `rule${id}`,
  }));
  expect(validateDocument(doc).structural).toBe(false);
});
it('resolves types/resources and refuses item scopes outside a repeated row', () => {
  for (const rule of [
    { ...compare, other: { scope: 'root', path: '/quantity' } },
    { ...compare, operator: 'gte' },
    { ...compare, other: { scope: 'root', path: '/missing' } },
    { ...compare, other: { scope: 'item', path: '/title' } },
    { id: 'remote', type: 'async', resource: 'missing', message: 'x' },
  ])
    expect(validateDocument(withRule(rule)).valid).toBe(false);
  const doc = document();
  doc.ui.validators = [compare];
  expect(validateDocument(doc).valid).toBe(false);
});
it('validates repeat local references and all localizable message metadata', () => {
  const doc = document();
  doc.ui.children = [
    {
      id: 'repeat',
      kind: 'form.repeat',
      version: 1,
      bind: '/rows',
      children: [
        {
          id: 'value',
          kind: 'field.text',
          version: 1,
          bind: '/value',
          validators: [{ ...compare, other: { scope: 'item', path: '/value' } }],
        },
      ],
    },
  ];
  expect(validateDocument(doc).valid).toBe(true);
  expect(
    validateDocument(
      withRule({
        ...compare,
        message: { default: 'Saved', translations: { not_a_locale: 'bad' } },
      }),
    ).valid,
  ).toBe(false);
});
it('accepts only exact plain boolean results and never invokes response accessors', () => {
  expect(isValidationResult({ valid: true })).toBe(true);
  expect(isValidationResult({ valid: false })).toBe(true);
  for (const value of [
    null,
    [],
    true,
    { valid: 1 },
    { valid: true, message: 'private' },
    Object.assign(Object.create(null), { valid: true }),
    {
      get valid() {
        throw new Error('getter');
      },
    },
  ])
    expect(isValidationResult(value)).toBe(false);
});
it('makes bounded immutable JSON snapshots without leaking accessors or aliases', () => {
  const input = { secret: ['original'], number: 0, flag: false };
  const copy = validationSnapshot(input) as typeof input;
  expect(copy).toEqual(input);
  expect(copy).not.toBe(input);
  expect(Object.isFrozen(copy.secret)).toBe(true);
  input.secret[0] = 'changed';
  expect(copy.secret[0]).toBe('original');
  const cyclic: unknown[] = [];
  cyclic.push(cyclic);
  for (const value of [
    undefined,
    NaN,
    new Date(),
    cyclic,
    new Array(2),
    {
      get data() {
        throw new Error('must not invoke');
      },
    },
    'x'.repeat(262145),
    Array.from({ length: 10001 }, () => 0),
  ])
    expect(() => validationSnapshot(value)).toThrow();
  let deep: unknown = 0;
  for (let i = 0; i < 26; i++) deep = { child: deep };
  expect(() => validationSnapshot(deep)).toThrow();
});
