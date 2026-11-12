import { TestBed } from '@angular/core/testing';
import { fieldAt } from '@haven/ui/form-state';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  setupValidationTests,
  createValidation,
  pendingValidation,
  validationDocument,
} from '../../../tests/ui/validation-support';
beforeEach(setupValidationTests);
afterEach(() => TestBed.resetTestingModule());
for (const mode of ['readonly', 'disabled', 'hidden'] as const) {
  it(`cancels renderer ${mode} validation and restarts only when interactive`, async () => {
    const doc = validationDocument();
    if (mode !== 'readonly')
      doc.ui.children![0]!.rules = {
        [mode === 'hidden' ? 'visible' : 'disabled']: {
          op: 'eq',
          left: { path: '/enabled' },
          right: { literal: true },
        },
      };
    const value = { name: 'First', other: 'Other', enabled: true };
    if (mode === 'disabled') value.enabled = false;
    const { calls, adapter } = pendingValidation(),
      fixture = createValidation(doc, value, adapter),
      r = fixture.componentInstance;
    await expect.poll(() => calls.length).toBe(1);
    if (mode === 'readonly') {
      const changed = structuredClone(doc);
      changed.ui.children![0]!.props!['readonly'] = true;
      fixture.componentRef.setInput('document', changed);
    } else r.value.update((v) => ({ ...v, enabled: !value.enabled }));
    TestBed.tick();
    await expect.poll(() => calls[0]!.request.signal.aborted).toBe(true);
    expect(r.pending()).toBe(false);
    calls[0]!.resolve({ valid: false });
    await fixture.whenStable();
    expect(fieldAt(r.fields()!, '/name')!().valid()).toBe(true);
    if (mode === 'readonly') fixture.componentRef.setInput('document', doc);
    else r.value.update((v) => ({ ...v, enabled: value.enabled }));
    TestBed.tick();
    await expect.poll(() => calls.length).toBe(2);
    calls[1]!.resolve({ valid: true });
    await fixture.whenStable();
    expect(fieldAt(r.fields()!, '/name')!().valid()).toBe(true);
  });
}
it('isolates host revision replacement, deleted validators and destroyed owners from late success/failure', async () => {
  const { calls, adapter } = pendingValidation(),
    fixture = createValidation(undefined, undefined, adapter),
    r = fixture.componentInstance;
  await expect.poll(() => calls.length).toBe(1);
  fixture.componentRef.setInput('host', {
    revision: 'new',
    validators: new Map([['test.check', adapter]]),
  });
  TestBed.tick();
  await expect.poll(() => calls.length).toBe(2);
  expect(calls[0]!.request.signal.aborted).toBe(true);
  calls[0]!.reject(new Error('old private'));
  calls[1]!.resolve({ valid: true });
  await fixture.whenStable();
  expect(fieldAt(r.fields()!, '/name')!().valid()).toBe(true);
  r.value.update((v) => ({ ...v, name: 'replacement' }));
  TestBed.tick();
  await expect.poll(() => calls.length).toBe(3);
  const changed = validationDocument();
  changed.ui.children![0]!.validators = [];
  fixture.componentRef.setInput('document', changed);
  TestBed.tick();
  expect(calls[2]!.request.signal.aborted).toBe(true);
  calls[2]!.resolve({ valid: false });
  await fixture.whenStable();
  expect(r.pending()).toBe(false);
  fixture.destroy();
  r.value.update((v) => ({ ...v, name: 'after-destroy' }));
  TestBed.tick();
  expect(calls).toHaveLength(3);
});
it('does not apply submission errors to a new owner or report a stale save as accepted', async () => {
  const doc = validationDocument();
  doc.ui.children![0]!.validators = [];
  const fixture = createValidation(doc);
  await fixture.whenStable();
  const r = fixture.componentInstance;
  let complete!: (value: undefined) => void;
  const action = () => new Promise<undefined>((resolve) => (complete = resolve));
  const first = r.submit({ action });
  expect(r.submitting()).toBe(true);
  expect(
    await r.submit({
      action: async () => {
        throw new Error('duplicate');
      },
    }),
  ).toBe(false);
  fixture.componentRef.setInput('host', { revision: 'new' });
  await fixture.whenStable();
  complete(undefined);
  expect(await first).toBe(false);
  expect(r.submitting()).toBe(false);
});

it('replaces an adapter without changing the form owner and ignores the old completion', async () => {
  const first = pendingValidation(),
    second = pendingValidation(),
    fixture = createValidation(undefined, undefined, first.adapter),
    r = fixture.componentInstance;
  await expect.poll(() => first.calls.length).toBe(1);
  const tree = r.fields();
  fixture.componentRef.setInput('host', { validators: new Map([['test.check', second.adapter]]) });
  TestBed.tick();
  await expect.poll(() => second.calls.length).toBe(1);
  expect(r.fields()).toBe(tree);
  expect(first.calls[0]!.request.signal.aborted).toBe(true);
  second.calls[0]!.resolve({ valid: true });
  await fixture.whenStable();
  first.calls[0]!.resolve({ valid: false });
  await fixture.whenStable();
  expect(fieldAt(tree!, '/name')!().valid()).toBe(true);
});

it('rejects a synchronous submit until a replacement document owner has its own form', async () => {
  const doc = validationDocument();
  doc.ui.children![0]!.validators = [];
  const fixture = createValidation(doc);
  await fixture.whenStable();
  const r = fixture.componentInstance;
  let calls = 0;
  fixture.componentRef.setInput('host', { revision: 'replacement' });
  expect(
    await r.submit({
      action: async () => {
        calls++;
      },
    }),
  ).toBe(false);
  expect(calls).toBe(0);
  await fixture.whenStable();
  expect(
    await r.submit({
      action: async () => {
        calls++;
      },
    }),
  ).toBe(true);
  expect(calls).toBe(1);
});
