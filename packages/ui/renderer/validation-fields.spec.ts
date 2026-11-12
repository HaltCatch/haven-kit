import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslocoService } from '@jsverse/transloco';
import { HavenLocalization } from '@haven/ui';
import { HavenTextField } from '@haven/ui/form';
import { fieldAt } from '@haven/ui/form-state';
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
it('uses native pending and strict submit, sends only immutable declared dependencies and translates settled errors without refetch', async () => {
  const doc = validationDocument();
  doc.ui.children![0]!.validators = [
    { ...asyncRule, dependencies: { other: { scope: 'root', path: '/other' } } },
  ];
  const { calls, adapter } = pendingValidation(),
    fixture = createValidation(doc, undefined, adapter),
    renderer = fixture.componentInstance;
  await expect.poll(() => calls.length).toBe(1);
  expect(renderer.pending()).toBe(true);
  expect(calls[0]!.request.value).toBe('First');
  expect(calls[0]!.request.dependencies).toEqual({ other: 'Dependency' });
  expect('secret' in calls[0]!.request).toBe(false);
  expect(Object.isFrozen(calls[0]!.request.dependencies)).toBe(true);
  expect(fixture.debugElement.query(By.directive(HavenTextField)).componentInstance.pending()).toBe(
    true,
  );
  let submitted = 0;
  expect(
    await renderer.submit({
      action: async () => {
        submitted++;
      },
    }),
  ).toBe(false);
  expect(submitted).toBe(0);
  calls[0]!.resolve({ valid: false });
  await fixture.whenStable();
  const field = fieldAt(renderer.fields()!, '/name')!;
  expect(field().invalid()).toBe(true);
  expect(TestBed.inject(HavenLocalization).error(field().errors()[0]!)).toBe('Rejected value');
  TestBed.inject(TranslocoService).setActiveLang('zh-CN');
  await fixture.whenStable();
  expect(TestBed.inject(HavenLocalization).error(field().errors()[0]!)).toBe('此值未通过');
  expect(calls).toHaveLength(1);
  renderer.value.update((value) => ({ ...value, secret: 'Unrelated update' }));
  fixture.componentRef.setInput('document', {
    ...doc,
    title: 'Cosmetic',
    theme: { ...doc.theme, density: 'compact' },
  });
  TestBed.tick();
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(calls).toHaveLength(1);
  renderer.value.update((value) => ({ ...value, other: 'Changed' }));
  TestBed.tick();
  await expect.poll(() => calls.length).toBe(2);
  calls[1]!.resolve({ valid: true });
  await fixture.whenStable();
  expect(
    await renderer.submit({
      action: async () => {
        submitted++;
      },
    }),
  ).toBe(true);
  expect(submitted).toBe(1);
});
it('diagnoses missing adapters, malformed results and private transport failures without accepting save', async () => {
  const fixture = createValidation();
  const renderer = fixture.componentInstance;
  expect(fieldAt(renderer.fields()!, '/name')!().errors()[0]?.kind).toBe('validationUnconfigured');
  let executed = false;
  expect(
    await renderer.submit({
      action: async () => {
        executed = true;
      },
    }),
  ).toBe(false);
  expect(executed).toBe(false);
  const { calls, adapter } = pendingValidation();
  fixture.componentRef.setInput('host', { validators: new Map([['test.check', adapter]]) });
  TestBed.tick();
  await expect.poll(() => calls.length).toBe(1);
  calls[0]!.resolve({ valid: 'yes' } as unknown as { valid: boolean });
  await fixture.whenStable();
  expect(fieldAt(renderer.fields()!, '/name')!().errors()[0]?.kind).toBe('validationResponse');
  renderer.value.update((v) => ({ ...v, name: 'new' }));
  TestBed.tick();
  await expect.poll(() => calls.length).toBe(2);
  calls[1]!.reject(new Error('Private credentials failure'));
  await fixture.whenStable();
  expect(fieldAt(renderer.fields()!, '/name')!().errors()[0]?.kind).toBe('validationUnavailable');
  expect(
    JSON.stringify(
      fieldAt(renderer.fields()!, '/name')!()
        .errors()
        .map((e) => ({ kind: e.kind, message: e.message })),
    ),
  ).not.toContain('credentials');
});
it('compiles cross-field rules natively and observes only the current row after reorder', async () => {
  const doc = validationDocument();
  doc.dataSchema = {
    type: 'object',
    properties: {
      rows: {
        type: 'array',
        items: {
          type: 'object',
          properties: { left: { type: 'number' }, right: { type: 'number' } },
        },
      },
    },
  };
  doc.ui.children = [
    {
      id: 'repeat',
      kind: 'form.repeat',
      version: 1,
      bind: '/rows',
      children: [
        {
          id: 'right',
          kind: 'field.number',
          version: 1,
          bind: '/right',
          validators: [
            {
              id: 'order',
              type: 'compare',
              operator: 'gte',
              other: { scope: 'item', path: '/left' },
              message: 'Must be at least left',
            },
          ],
        },
      ],
    },
  ];
  const fixture = createValidation(doc, {
    rows: [
      { left: 0, right: 0 },
      { left: 2, right: 1 },
    ],
  });
  await fixture.whenStable();
  const r = fixture.componentInstance;
  expect(fieldAt(r.fields()!, '/rows/0/right')!().valid()).toBe(true);
  expect(fieldAt(r.fields()!, '/rows/1/right')!().invalid()).toBe(true);
  const rows = r.value()['rows'] as { left: number; right: number }[];
  r.value.set({ rows: [rows[1]!, rows[0]!] });
  await fixture.whenStable();
  expect(fieldAt(r.fields()!, '/rows/0/right')!().invalid()).toBe(true);
  expect(fieldAt(r.fields()!, '/rows/1/right')!().valid()).toBe(true);
});
it('adds/removes validators without a schema edit while cosmetic edits retain the form and current input', async () => {
  const doc = validationDocument();
  doc.ui.children![0]!.validators = [];
  const fixture = createValidation(doc);
  await fixture.whenStable();
  const r = fixture.componentInstance,
    tree = r.fields();
  fixture.componentRef.setInput('document', { ...doc, title: 'Cosmetic' });
  await fixture.whenStable();
  expect(r.fields()).toBe(tree);
  const changed = structuredClone(doc);
  changed.ui.children![0]!.validators = [
    {
      id: 'match',
      type: 'compare',
      operator: 'eq',
      other: { scope: 'root', path: '/other' },
      message: 'Match',
    },
  ];
  fixture.componentRef.setInput('document', changed);
  await fixture.whenStable();
  expect(r.fields()).not.toBe(tree);
  expect(fieldAt(r.fields()!, '/name')!().invalid()).toBe(true);
  expect(r.value()['name']).toBe('First');
});
