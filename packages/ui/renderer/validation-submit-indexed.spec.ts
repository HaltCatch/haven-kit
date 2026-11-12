import { TestBed } from '@angular/core/testing';
import { fieldAt } from '@haven/ui/form-state';
import { validateDocument } from '@haven/schema';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  setupValidationTests,
  createValidation,
  pendingValidation,
  validationDocument,
  asyncRule,
} from '../../../tests/ui/validation-support';
beforeEach(setupValidationTests);
afterEach(() => TestBed.resetTestingModule());
it('blocks immediate submission after a validated value changes before effects flush', async () => {
  const p = pendingValidation(),
    f = createValidation(undefined, undefined, p.adapter),
    r = f.componentInstance;
  await expect.poll(() => p.calls.length).toBe(1);
  p.calls[0]!.resolve({ valid: true });
  await f.whenStable();
  let saved = 0;
  r.value.update((v) => ({ ...v, name: 'Changed' }));
  const result = await r.submit({
    action: async () => {
      saved++;
    },
  });
  expect(saved).toBe(0);
  expect(result).toBe(false);
});
it('blocks immediate submission after dynamic adapter replacement before effects flush', async () => {
  const p = pendingValidation(),
    q = pendingValidation(),
    f = createValidation(undefined, undefined, p.adapter),
    r = f.componentInstance;
  await expect.poll(() => p.calls.length).toBe(1);
  p.calls[0]!.resolve({ valid: true });
  await f.whenStable();
  let saved = 0;
  f.componentRef.setInput('host', { validators: new Map([['test.check', q.adapter]]) });
  expect(
    await r.submit({
      action: async () => {
        saved++;
      },
    }),
  ).toBe(false);
  expect(saved).toBe(0);
});
it('compiles a validator dependency pointing at a specific existing array item', async () => {
  const d = validationDocument();
  d.dataSchema.properties!['rows'] = {
    type: 'array',
    items: { type: 'object', properties: { name: { type: 'string' } } },
  };
  d.ui.children![0]!.validators = [
    {
      id: 'equals-row',
      type: 'compare',
      operator: 'eq',
      other: { scope: 'root', path: '/rows/0/name' },
      message: 'Match row',
    },
  ];
  expect(validateDocument(d).diagnostics).toEqual([]);
  const f = createValidation(d, { name: 'Wrong', other: '', rows: [{ name: 'Correct' }] });
  await f.whenStable();
  expect(fieldAt(f.componentInstance.fields()!, '/name')!().invalid()).toBe(true);
});
it('compiles a validator on an indexed array binding accepted by schema', async () => {
  const d = validationDocument();
  d.dataSchema.properties!['rows'] = {
    type: 'array',
    items: { type: 'object', properties: { name: { type: 'string' } } },
  };
  d.ui.children![0]!.bind = '/rows/0/name';
  d.ui.children![0]!.validators = [
    {
      id: 'equals-root',
      type: 'compare',
      operator: 'eq',
      other: { scope: 'root', path: '/other' },
      message: 'Match root',
    },
  ];
  expect(validateDocument(d).diagnostics).toEqual([]);
  const f = createValidation(d, { name: '', other: 'Correct', rows: [{ name: 'Wrong' }] });
  await f.whenStable();
  expect(fieldAt(f.componentInstance.fields()!, '/rows/0/name')!().invalid()).toBe(true);
});
it('keeps settled false invalid on submit and turns cleared dependencies idle without stale errors', async () => {
  const d = validationDocument();
  d.ui.children![0]!.validators = [
    { ...asyncRule, dependencies: { other: { scope: 'root', path: '/other' } } },
  ];
  const p = pendingValidation(),
    f = createValidation(d, undefined, p.adapter),
    r = f.componentInstance;
  await expect.poll(() => p.calls.length).toBe(1);
  p.calls[0]!.resolve({ valid: false });
  await f.whenStable();
  r.value.update((v) => ({ ...v, other: '' }));
  await f.whenStable();
  expect(fieldAt(r.fields()!, '/name')!().errors()).toEqual([]);
  expect(p.calls).toHaveLength(1);
});
