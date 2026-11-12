import { DestroyRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form } from '@angular/forms/signals';
import type { DataSchema } from '@haven/schema';
import type { ValidationAdapter, ValidationRequest } from '@haven/runtime';
import { afterEach, expect, it } from 'vitest';
import { fieldAt } from './field-access';
import { formSchema } from './form-schema';
import type { ValidationScope } from './validation-plan';
const policy = () => ({ visible: true, disabled: false, readonly: false, required: false });
const rule = {
  id: 'match',
  type: 'compare' as const,
  operator: 'eq' as const,
  other: { scope: 'root' as const, path: '/other' },
  message: 'Must match',
};
function create(
  schema: DataSchema,
  value: Record<string, unknown>,
  plan: ValidationScope,
  adapter?: ValidationAdapter,
) {
  return TestBed.runInInjectionContext(() => {
    const data = signal(value);
    const fields = form(
      data,
      formSchema(schema, policy, {
        plan,
        environment: {
          owner: TestBed.inject(DestroyRef),
          active: () => true,
          adapter: () => adapter,
        },
      }),
    );
    return { data, fields };
  });
}
afterEach(() => TestBed.resetTestingModule());
it('compiles fixed array target by native applyEach and gates only its actual index', () => {
  const row: DataSchema = { type: 'object', properties: { name: { type: 'string' } } };
  const p = create(
    {
      type: 'object',
      properties: { other: { type: 'string' }, rows: { type: 'array', items: row } },
    },
    { other: 'Correct', rows: [{ name: 'Wrong' }, { name: 'Also wrong' }] },
    { fields: [{ sourceId: 'fixed', bind: '/rows/0/name', rules: [rule] }], repeats: [] },
  );
  expect(fieldAt(p.fields, '/rows/0/name')!().invalid()).toBe(true);
  expect(fieldAt(p.fields, '/rows/1/name')!().invalid()).toBe(false);
  p.data.update((v) => ({ ...v, rows: [{ name: 'Correct' }, { name: 'Wrong' }] }));
  expect(fieldAt(p.fields, '/rows/0/name')!().valid()).toBe(true);
  expect(fieldAt(p.fields, '/rows/1/name')!().valid()).toBe(true);
});
it('does not treat an object numeric property as an array index', () => {
  const p = create(
    {
      type: 'object',
      properties: {
        other: { type: 'string' },
        record: { type: 'object', properties: { '0': { type: 'string' } } },
      },
    },
    { other: 'Correct', record: { '0': 'Wrong' } },
    { fields: [{ sourceId: 'numeric', bind: '/record/0', rules: [rule] }], repeats: [] },
  );
  expect(fieldAt(p.fields, '/record/0')!().invalid()).toBe(true);
});
it('resolves fixed parent arrays before a repeated item scope without leaking to siblings', () => {
  const row: DataSchema = { type: 'object', properties: { name: { type: 'string' } } };
  const group: DataSchema = { type: 'object', properties: { rows: { type: 'array', items: row } } };
  const p = create(
    {
      type: 'object',
      properties: { other: { type: 'string' }, groups: { type: 'array', items: group } },
    },
    {
      other: 'Correct',
      groups: [{ rows: [{ name: 'Wrong' }, { name: 'Correct' }] }, { rows: [{ name: 'Wrong' }] }],
    },
    {
      fields: [],
      repeats: [
        {
          bind: '/groups/0/rows',
          scope: { fields: [{ sourceId: 'repeated', bind: '/name', rules: [rule] }], repeats: [] },
        },
      ],
    },
  );
  expect(fieldAt(p.fields, '/groups/0/rows/0/name')!().invalid()).toBe(true);
  expect(fieldAt(p.fields, '/groups/0/rows/1/name')!().valid()).toBe(true);
  expect(fieldAt(p.fields, '/groups/1/rows/0/name')!().valid()).toBe(true);
});

it('treats a missing indexed dependency as an optional value and tracks later row insertion/removal', () => {
  const row: DataSchema = { type: 'object', properties: { name: { type: 'string' } } };
  const p = create(
    {
      type: 'object',
      properties: { other: { type: 'string' }, rows: { type: 'array', items: row } },
    },
    { other: 'Expected', rows: [] },
    {
      fields: [
        {
          sourceId: 'root',
          bind: '/other',
          rules: [{ ...rule, other: { scope: 'root', path: '/rows/0/name' } }],
        },
      ],
      repeats: [],
    },
  );
  expect(() => fieldAt(p.fields, '/other')!().valid()).not.toThrow();
  expect(fieldAt(p.fields, '/other')!().valid()).toBe(true);
  p.data.update((v) => ({ ...v, rows: [{ name: 'Wrong' }] }));
  expect(fieldAt(p.fields, '/other')!().invalid()).toBe(true);
  p.data.update((v) => ({ ...v, rows: [] }));
  expect(fieldAt(p.fields, '/other')!().valid()).toBe(true);
});

it('starts async validation only when a formerly absent indexed dependency exists', async () => {
  const row: DataSchema = { type: 'object', properties: { name: { type: 'string' } } };
  const requests: ValidationRequest[] = [];
  const p = create(
    {
      type: 'object',
      properties: { other: { type: 'string' }, rows: { type: 'array', items: row } },
    },
    { other: 'Expected', rows: [] },
    {
      fields: [
        {
          sourceId: 'root',
          bind: '/other',
          rules: [
            {
              id: 'check',
              type: 'async',
              resource: 'check',
              message: 'No',
              dependencies: { first: { scope: 'root', path: '/rows/0/name' } },
            },
          ],
        },
      ],
      repeats: [],
    },
    {
      validate: async (request) => {
        requests.push(request);
        return { valid: true };
      },
    },
  );
  TestBed.tick();
  expect(requests).toHaveLength(0);
  expect(fieldAt(p.fields, '/other')!().valid()).toBe(true);
  p.data.update((v) => ({ ...v, rows: [{ name: 'Inserted' }] }));
  TestBed.tick();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]!.dependencies).toEqual({ first: 'Inserted' });
  p.data.update((v) => ({ ...v, rows: [] }));
  TestBed.tick();
  expect(fieldAt(p.fields, '/other')!().errors()).toEqual([]);
});
