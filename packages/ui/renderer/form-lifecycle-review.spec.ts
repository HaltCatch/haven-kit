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

it('reconciles a same-owner schema extension while retaining compatible interaction state and cancelling the old validator', async () => {
  const doc = validationDocument(),
    { calls, adapter } = pendingValidation(),
    fixture = createValidation(doc, undefined, adapter),
    renderer = fixture.componentInstance;
  await expect.poll(() => calls.length).toBe(1);
  const oldTree = renderer.fields()!,
    oldName = fieldAt(oldTree, '/name')!();
  oldName.markAsTouched();
  oldName.markAsDirty();
  const changed = structuredClone(doc);
  changed.dataSchema.properties!['added'] = { type: 'string' };
  changed.ui.children!.push({
    id: 'added',
    kind: 'field.text',
    version: 1,
    bind: '/added',
    props: { label: 'Added' },
  });
  fixture.componentRef.setInput('document', changed);
  let saved = false;
  expect(
    await renderer.submit({
      action: async () => {
        saved = true;
      },
    }),
  ).toBe(false);
  expect(saved).toBe(false);
  await expect.poll(() => calls.length).toBe(2);
  expect(calls[0]!.request.signal.aborted).toBe(true);
  calls[0]!.resolve({ valid: false });
  calls[1]!.resolve({ valid: true });
  await fixture.whenStable();
  expect(renderer.fields()).not.toBe(oldTree);
  const name = fieldAt(renderer.fields()!, '/name')!(),
    added = fieldAt(renderer.fields()!, '/added')!();
  expect(name.value()).toBe('First');
  expect(name.dirty()).toBe(true);
  expect(name.touched()).toBe(true);
  expect(name.valid()).toBe(true);
  expect(added.value()).toBe('');
  expect(added.dirty()).toBe(false);
  expect(added.touched()).toBe(false);
});

it('does not accept a pending submission after same-owner form structure replacement', async () => {
  const doc = validationDocument();
  doc.ui.children![0]!.validators = [];
  const fixture = createValidation(doc),
    renderer = fixture.componentInstance;
  await fixture.whenStable();
  const oldTree = renderer.fields();
  let finish!: () => void;
  const submission = renderer.submit({
    action: () =>
      new Promise<undefined>((resolve) => {
        finish = () => resolve(undefined);
      }),
  });
  await expect.poll(() => typeof finish).toBe('function');
  expect(renderer.submitting()).toBe(true);
  const changed = structuredClone(doc);
  changed.dataSchema.properties!['name']!.maxLength = 100;
  fixture.componentRef.setInput('document', changed);
  finish();
  expect(await submission).toBe(false);
  await fixture.whenStable();
  expect(renderer.fields()).not.toBe(oldTree);
  expect(renderer.submitting()).toBe(false);
  let saved = 0;
  expect(
    await renderer.submit({
      action: async () => {
        saved++;
      },
    }),
  ).toBe(true);
  expect(saved).toBe(1);
});

it('destroys the old validation injector when a model becomes structurally invalid and can build a clean form when repaired', async () => {
  const doc = validationDocument(),
    { calls, adapter } = pendingValidation(),
    fixture = createValidation(doc, undefined, adapter),
    renderer = fixture.componentInstance;
  await expect.poll(() => calls.length).toBe(1);
  const oldTree = renderer.fields();
  fixture.componentRef.setInput('document', { ...doc, dataSchema: { type: 'invalid-type' } });
  TestBed.tick();
  expect(renderer.validation().structural).toBe(false);
  expect(calls[0]!.request.signal.aborted).toBe(true);
  calls[0]!.resolve({ valid: false });
  await fixture.whenStable();
  fixture.componentRef.setInput('document', doc);
  await expect
    .poll(() => {
      TestBed.tick();
      return calls.length;
    })
    .toBe(2);
  calls[1]!.resolve({ valid: true });
  await fixture.whenStable();
  expect(renderer.fields()).not.toBe(oldTree);
  expect(fieldAt(renderer.fields()!, '/name')!().valid()).toBe(true);
});
