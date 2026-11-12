import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { HavenDocument, RemoteTreeNode } from '@haven/schema';
import type { TreeDataAdapter, TreeResolution } from '@haven/runtime';
import { HavenRemoteTreeSelectField, HavenRemoteTreeMultiselectField } from '@haven/ui/tree';
import { fieldAt } from '@haven/ui/form-state';
import { HavenRenderer } from '../../renderer';
import { setupTreeSelection } from '../../../../../tests/ui/tree-selection-support';

const branch: RemoteTreeNode = { key: 'branch', label: 'Branch', hasChildren: true };
const zero: RemoteTreeNode = { key: 0, label: 'Zero', hasChildren: false };
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
};
function document(kind = 'field.tree-select'): HavenDocument {
  return {
    schemaVersion: '1.0',
    id: 'remote-tree-fields',
    title: 'Remote trees',
    dataSchema: {
      type: 'object',
      properties: {
        choice:
          kind === 'field.tree-multiselect'
            ? { type: 'array', items: { type: 'number' } }
            : { type: 'number' },
      },
    },
    ui: {
      id: 'root',
      kind: 'form',
      version: 1,
      children: [
        {
          id: 'choice',
          kind,
          version: 1,
          bind: '/choice',
          props: { label: 'Choice', resource: 'nodes', leafOnly: true },
        },
      ],
    },
    actions: {},
    resources: { nodes: { type: 'tree', adapter: 'test.nodes' } },
    theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
  };
}
function fixture(adapter: TreeDataAdapter, kind = 'field.tree-select') {
  const f = TestBed.createComponent(HavenRenderer);
  f.componentRef.setInput('document', document(kind));
  f.componentRef.setInput('host', { trees: new Map([['test.nodes', adapter]]), revision: 'one' });
  f.componentRef.setInput('value', { choice: kind === 'field.tree-multiselect' ? [0] : 0 });
  return {
    f,
    r: f.componentInstance,
    field: () => fieldAt(f.componentInstance.fields()!, '/choice')!(),
  };
}
beforeEach(setupTreeSelection);
afterEach(() => TestBed.resetTestingModule());

it('retains unresolved typed values and blocks strict submit until the complete path resolves', async () => {
  const pending = deferred<TreeResolution>();
  const { f, r, field } = fixture({
    children: async () => [branch],
    resolve: () => pending.promise,
  });
  await f.whenStable();
  let calls = 0;
  expect(field().valid()).toBe(false);
  expect(
    await r.submit({
      action: async () => {
        calls++;
      },
    }),
  ).toBe(false);
  expect(r.value()['choice']).toBe(0);
  pending.resolve({ paths: [[branch, zero]], unresolved: [] });
  await f.whenStable();
  await expect
    .poll(() => {
      TestBed.tick();
      return field().valid();
    })
    .toBe(true);
  expect(
    await r.submit({
      action: async () => {
        calls++;
      },
    }),
  ).toBe(true);
  expect(calls).toBe(1);
  expect(
    (f.nativeElement as HTMLElement).querySelector<HTMLInputElement>('[data-display]')!.value,
  ).toBe('Zero');
});

it('rejects a failed or missing selection without silently clearing the persisted value, and supports retry', async () => {
  let fail = true;
  const { f, r, field } = fixture({
    children: async () => [branch],
    resolve: async () => {
      if (fail) throw new Error('private transport detail');
      return { paths: [], unresolved: [0] };
    },
  });
  await f.whenStable();
  await expect
    .poll(() => {
      TestBed.tick();
      return field()
        .errors()
        .map((error) => error.kind);
    })
    .toContain('optionsLoad');
  expect((f.nativeElement as HTMLElement).textContent).not.toContain('private transport detail');
  const control = f.debugElement.query(By.directive(HavenRemoteTreeSelectField))
    .componentInstance as HavenRemoteTreeSelectField;
  fail = false;
  control.retry();
  await f.whenStable();
  await expect
    .poll(() => {
      TestBed.tick();
      return field()
        .errors()
        .map((error) => error.kind);
    })
    .toContain('option');
  expect(r.value()['choice']).toBe(0);
});

it('treats hasChildren as authoritative for leaf-only values and preserves independent numeric multi keys', async () => {
  const { f, r, field } = fixture(
    {
      children: async () => [branch],
      resolve: async (keys) => ({
        paths: keys.map((key) => (key === 0 ? [branch, zero] : [branch])),
        unresolved: [],
      }),
    },
    'field.tree-multiselect',
  );
  await f.whenStable();
  await expect
    .poll(() => {
      TestBed.tick();
      return field().valid();
    })
    .toBe(true);
  const control = f.debugElement.query(By.directive(HavenRemoteTreeMultiselectField))
    .componentInstance as HavenRemoteTreeMultiselectField;
  expect(control.display()).toBe('Zero');
  r.value.set({ choice: ['branch'] });
  await f.whenStable();
  expect(field().valid()).toBe(false);
  expect(r.value()['choice']).toEqual(['branch']);
});

it('revokes prior membership immediately when the host replaces an adapter under the same registered name', async () => {
  const { f, r, field } = fixture({
    children: async () => [branch],
    resolve: async () => ({ paths: [[branch, zero]], unresolved: [] }),
  });
  await f.whenStable();
  await expect
    .poll(() => {
      TestBed.tick();
      return field().valid();
    })
    .toBe(true);
  const oldControl = f.debugElement.query(By.directive(HavenRemoteTreeSelectField))
    .componentInstance as HavenRemoteTreeSelectField;
  const pending = deferred<TreeResolution>();
  f.componentRef.setInput('host', {
    trees: new Map([
      ['test.nodes', { children: async () => [branch], resolve: () => pending.promise }],
    ]),
    revision: 'one',
  });
  let calls = 0;
  expect(
    await r.submit({
      action: async () => {
        calls++;
      },
    }),
  ).toBe(false);
  await f.whenStable();
  // Even a queued old control resolution cannot confirm membership for its replacement adapter.
  oldControl.resolution.emit({
    ...oldControl.membership.resolution(),
    ready: true,
    pending: false,
  });
  expect(field().valid()).toBe(false);
  pending.resolve({ paths: [], unresolved: [0] });
  await f.whenStable();
  expect(field().valid()).toBe(false);
  expect(calls).toBe(0);
  expect(r.value()['choice']).toBe(0);
});
