import { TestBed } from '@angular/core/testing';
import { fieldAt } from '@haven/ui/form-state';
import type { JsonObject } from '@haven/schema';
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
it('keeps repeat requests attached to native row identities, scopes dependencies, and aborts removed or replaced rows', async () => {
  const doc = validationDocument();
  doc.dataSchema = {
    type: 'object',
    properties: {
      tenant: { type: 'string' },
      rows: {
        type: 'array',
        items: {
          type: 'object',
          properties: { name: { type: 'string' }, other: { type: 'string' } },
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
          id: 'name',
          kind: 'field.text',
          version: 1,
          bind: '/name',
          validators: [
            {
              ...asyncRule,
              dependencies: {
                other: { scope: 'item', path: '/other' },
                tenant: { scope: 'root', path: '/tenant' },
              },
            },
          ],
        },
      ],
    },
  ];
  const { calls, adapter } = pendingValidation(),
    fixture = createValidation(
      doc,
      {
        tenant: 'Root',
        rows: [
          { name: 'A', other: 'One' },
          { name: 'B', other: 'Two' },
        ],
      },
      adapter,
    ),
    r = fixture.componentInstance;
  await expect.poll(() => calls.length).toBe(2);
  const a = calls.find((c) => c.request.value === 'A')!,
    b = calls.find((c) => c.request.value === 'B')!;
  expect(a.request.dependencies).toEqual({ other: 'One', tenant: 'Root' });
  expect(b.request.dependencies).toEqual({ other: 'Two', tenant: 'Root' });
  const rows = r.value()['rows'] as JsonObject[];
  r.value.set({ tenant: 'Root', rows: [rows[1]!, rows[0]!] });
  TestBed.tick();
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(calls).toHaveLength(2);
  expect(a.request.signal.aborted).toBe(false);
  expect(b.request.signal.aborted).toBe(false);
  r.value.set({ tenant: 'Root', rows: [rows[1]!] });
  TestBed.tick();
  await expect.poll(() => a.request.signal.aborted).toBe(true);
  expect(b.request.signal.aborted).toBe(false);
  r.value.set({ tenant: 'Root', rows: [{ name: 'C', other: 'Three' }] });
  TestBed.tick();
  await expect.poll(() => calls.length).toBe(3);
  expect(b.request.signal.aborted).toBe(true);
  expect(calls[2]!.request.dependencies).toEqual({ other: 'Three', tenant: 'Root' });
  calls[2]!.resolve({ valid: true });
  await fixture.whenStable();
  a.resolve({ valid: false });
  b.reject(new Error('old'));
  await fixture.whenStable();
  expect(fieldAt(r.fields()!, '/rows/0/name')!().valid()).toBe(true);
});
it('does not request until synchronous constraints pass, bounds snapshots and keeps empty dependencies idle', async () => {
  const doc = validationDocument();
  doc.dataSchema.properties!['name']!.minLength = 3;
  doc.ui.children![0]!.validators = [
    { ...asyncRule, dependencies: { other: { scope: 'root', path: '/other' } } },
  ];
  const { calls, adapter } = pendingValidation(),
    fixture = createValidation(doc, { name: 'x', other: '', secret: '' }, adapter),
    r = fixture.componentInstance;
  await fixture.whenStable();
  expect(calls).toHaveLength(0);
  r.value.update((v) => ({ ...v, name: 'Valid' }));
  await fixture.whenStable();
  expect(calls).toHaveLength(0);
  r.value.update((v) => ({ ...v, other: 'Ready' }));
  TestBed.tick();
  await expect.poll(() => calls.length).toBe(1);
  calls[0]!.resolve({ valid: true });
  await fixture.whenStable();
  r.value.update((v) => ({ ...v, name: 'x'.repeat(262145) }));
  TestBed.tick();
  await expect
    .poll(() => fieldAt(r.fields()!, '/name')!().errors()[0]?.kind)
    .toBe('validationInput');
  expect(calls).toHaveLength(1);
});

it('resolves nearest item inside nested repeats without leaking sibling rows', async () => {
  const doc = validationDocument();
  doc.dataSchema = {
    type: 'object',
    properties: {
      groups: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            rows: {
              type: 'array',
              items: {
                type: 'object',
                properties: { name: { type: 'string' }, other: { type: 'string' } },
              },
            },
          },
        },
      },
    },
  };
  doc.ui.children = [
    {
      id: 'groups',
      kind: 'form.repeat',
      version: 1,
      bind: '/groups',
      children: [
        {
          id: 'rows',
          kind: 'form.repeat',
          version: 1,
          bind: '/rows',
          children: [
            {
              id: 'name',
              kind: 'field.text',
              version: 1,
              bind: '/name',
              validators: [
                { ...asyncRule, dependencies: { other: { scope: 'item', path: '/other' } } },
              ],
            },
          ],
        },
      ],
    },
  ];
  const { calls, adapter } = pendingValidation(),
    fixture = createValidation(
      doc,
      {
        groups: [
          { rows: [{ name: 'A', other: 'Local A' }] },
          { rows: [{ name: 'B', other: 'Local B' }] },
        ],
      },
      adapter,
    );
  await expect.poll(() => calls.length).toBe(2);
  expect(calls.find((c) => c.request.value === 'A')!.request.dependencies).toEqual({
    other: 'Local A',
  });
  expect(calls.find((c) => c.request.value === 'B')!.request.dependencies).toEqual({
    other: 'Local B',
  });
  calls.forEach((call) => call.resolve({ valid: true }));
  await fixture.whenStable();
  expect(fixture.componentInstance.fields()!().valid()).toBe(true);
});
