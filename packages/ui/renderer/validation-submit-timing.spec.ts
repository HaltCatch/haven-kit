import { TestBed } from '@angular/core/testing';
import { submitValidated } from '@haven/ui/form-state';
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
it('does not submit an async field on the same tick as unhiding it before its first request', async () => {
  const doc = validationDocument();
  doc.ui.children![0]!.rules = {
    visible: { op: 'eq', left: { path: '/enabled' }, right: { literal: true } },
  };
  const p = pendingValidation(),
    f = createValidation(doc, { name: 'New', other: '', enabled: false }, p.adapter),
    r = f.componentInstance;
  await f.whenStable();
  expect(p.calls).toHaveLength(0);
  r.value.update((v) => ({ ...v, enabled: true }));
  let saves = 0;
  expect(
    await r.submit({
      action: async () => {
        saves++;
      },
    }),
  ).toBe(false);
  expect(saves).toBe(0);
  await expect.poll(() => p.calls.length).toBe(1);
  p.calls[0]!.resolve({ valid: true });
  await f.whenStable();
  expect(
    await r.submit({
      action: async () => {
        saves++;
      },
    }),
  ).toBe(true);
  expect(saves).toBe(1);
});
it('does not submit on the same tick as providing a previously missing adapter', async () => {
  const p = pendingValidation(),
    f = createValidation(),
    r = f.componentInstance;
  await f.whenStable();
  f.componentRef.setInput('host', { validators: new Map([['test.check', p.adapter]]) });
  let saves = 0;
  expect(
    await r.submit({
      action: async () => {
        saves++;
      },
    }),
  ).toBe(false);
  expect(saves).toBe(0);
  await expect.poll(() => p.calls.length).toBe(1);
  p.calls[0]!.resolve({ valid: true });
  await f.whenStable();
  expect(
    await r.submit({
      action: async () => {
        saves++;
      },
    }),
  ).toBe(true);
  expect(saves).toBe(1);
});
it('the neutral public submit helper also blocks same-tick changed values', async () => {
  const p = pendingValidation(),
    f = createValidation(undefined, undefined, p.adapter),
    r = f.componentInstance;
  await expect.poll(() => p.calls.length).toBe(1);
  p.calls[0]!.resolve({ valid: true });
  await f.whenStable();
  r.value.update((v) => ({ ...v, name: 'Changed' }));
  let saves = 0;
  expect(
    await submitValidated(r.fields()!, {
      action: async () => {
        saves++;
      },
    }),
  ).toBe(false);
  expect(saves).toBe(0);
});

it.each(['visible', 'disabled', 'readonly'] as const)(
  'respects same-tick %s exclusion without retaining stale submit guards',
  async (mode) => {
    const doc = validationDocument();
    if (mode !== 'readonly')
      doc.ui.children![0]!.rules = {
        [mode]: { op: 'eq', left: { path: '/enabled' }, right: { literal: mode === 'visible' } },
      };
    const p = pendingValidation(),
      f = createValidation(doc, undefined, p.adapter),
      r = f.componentInstance;
    await expect.poll(() => p.calls.length).toBe(1);
    if (mode === 'readonly') {
      const changed = structuredClone(doc);
      changed.ui.children![0]!.props!['readonly'] = true;
      f.componentRef.setInput('document', changed);
    } else r.value.update((v) => ({ ...v, enabled: false }));
    let saves = 0;
    expect(
      await submitValidated(r.fields()!, {
        action: async () => {
          saves++;
        },
      }),
    ).toBe(true);
    expect(saves).toBe(1);
    await f.whenStable();
    expect(p.calls[0]!.request.signal.aborted).toBe(true);
    p.calls[0]!.resolve({ valid: false });
    await f.whenStable();
    expect(r.fields()!().valid()).toBe(true);
  },
);
it('refuses same-tick dependency changes, then permits a fresh successful native result', async () => {
  const doc = validationDocument();
  doc.ui.children![0]!.validators = [
    { ...asyncRule, dependencies: { other: { scope: 'root', path: '/other' } } },
  ];
  const p = pendingValidation(),
    f = createValidation(doc, undefined, p.adapter),
    r = f.componentInstance;
  await expect.poll(() => p.calls.length).toBe(1);
  p.calls[0]!.resolve({ valid: true });
  await f.whenStable();
  r.value.update((v) => ({ ...v, other: 'New dependency' }));
  let saves = 0;
  expect(
    await submitValidated(r.fields()!, {
      action: async () => {
        saves++;
      },
    }),
  ).toBe(false);
  expect(saves).toBe(0);
  await expect.poll(() => p.calls.length).toBe(2);
  expect(p.calls[1]!.request.dependencies).toEqual({ other: 'New dependency' });
  p.calls[1]!.resolve({ valid: true });
  await f.whenStable();
  expect(
    await submitValidated(r.fields()!, {
      action: async () => {
        saves++;
      },
    }),
  ).toBe(true);
  expect(saves).toBe(1);
});
