import { signal } from '@angular/core';
import { form } from '@angular/forms/signals';
import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import { buildTableHierarchy } from '@haven/runtime';
import { projectHavenTableRows } from '@haven/ui/table';
import { setupTableEditTests } from '../../../../tests/ui/table-edit-support';

afterEach(() => TestBed.resetTestingModule());

it('projects real native Signal Forms row identities into JSON for the standalone tree table without changing the canonical form', () => {
  setupTableEditTests();
  const model = signal({
    rows: [
      { id: 0, parent: null, name: 'Root' },
      { id: 1, parent: 0, name: 'Child' },
    ],
  });
  const fields = TestBed.runInInjectionContext(() => form(model));
  // Creating the actual item FieldTree attaches framework-owned identity metadata.
  fields.rows[0]!().value();
  fields.rows[1]!().value();
  const native = fields.rows().value();
  expect(Object.getOwnPropertySymbols(native[0]!)).not.toHaveLength(0);
  const identity = Object.getOwnPropertySymbols(native[0]!).map((key) => [
    key,
    Reflect.get(native[0]!, key),
  ]);
  const projected = projectHavenTableRows(native);
  expect(projected).toEqual([
    { id: 0, parent: null, name: 'Root' },
    { id: 1, parent: 0, name: 'Child' },
  ]);
  expect(projected?.every((row) => Object.getOwnPropertySymbols(row).length === 0)).toBe(true);
  const result = buildTableHierarchy(projected, '/id', { parentPath: '/parent', rootValue: null });
  expect(result.status).toBe('ready');
  expect(fields.rows().value()).toBe(native);
  expect(
    Object.getOwnPropertySymbols(native[0]!).map((key) => [key, Reflect.get(native[0]!, key)]),
  ).toEqual(identity);
  expect(projectHavenTableRows(projected)).toEqual(projected);
});

it('rejects invalid native values without invoking accessors or silently presenting missing data', () => {
  const getter = vi.fn(() => 'Unsafe');
  const row = { id: 0 };
  Object.defineProperty(row, 'name', { enumerable: true, get: getter });
  expect(projectHavenTableRows([row])).toBeNull();
  expect(projectHavenTableRows(new Array(1))).toBeNull();
  expect(projectHavenTableRows([{ id: 0, value: NaN }])).toBeNull();
  expect(getter).not.toHaveBeenCalled();
});
