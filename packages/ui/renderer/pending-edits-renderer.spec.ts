import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { signal } from '@angular/core';
import { HavenTreeEditor } from '@haven/ui/tree';
import { submitValidated } from '@haven/ui/form-state';
import type { HavenDocument } from '@haven/schema';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setupValidationTests } from '../../../tests/ui/validation-support';
import { HavenRenderer } from './renderer';

beforeEach(setupValidationTests);
afterEach(() => TestBed.resetTestingModule());
const document = (): HavenDocument => ({
  schemaVersion: '1.0',
  id: 'pending-owner',
  title: 'Pending edit boundary',
  dataSchema: { type: 'object', properties: { allowed: { type: 'boolean' } } },
  ui: {
    id: 'form',
    kind: 'form',
    version: 1,
    children: [
      {
        id: 'tree',
        kind: 'tree.editor',
        version: 1,
        props: {
          nodes: [{ key: 'root', label: 'Root', children: [{ key: 'leaf', label: 'Leaf' }] }],
          expandedKeys: ['root'],
        },
      },
    ],
  },
  theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
  actions: {},
  resources: {},
});
async function render(doc = document()) {
  const fixture = TestBed.createComponent(HavenRenderer);
  fixture.componentRef.setInput('document', doc);
  fixture.componentRef.setInput('host', { revision: 'one' });
  fixture.componentRef.setInput('value', { allowed: true });
  await fixture.whenStable();
  const renderer = fixture.componentInstance;
  const tree = fixture.debugElement.query(By.directive(HavenTreeEditor))
    .componentInstance as HavenTreeEditor;
  const row = () => tree.rows().find((row) => row.node().key === 'leaf')!;
  return { fixture, renderer, tree, row, doc };
}

it('blocks strict native and renderer submits immediately after a rename begins, then releases after cancel/commit', async () => {
  const { fixture, renderer, row } = await render(),
    save = vi.fn(async () => undefined);
  expect(renderer.pendingEdits()).toBe(false);
  row().beginRename();
  // No effect tick or whenStable may copy a pending boolean before these reads.
  expect(renderer.pendingEdits()).toBe(true);
  expect(await renderer.submit({ action: save })).toBe(false);
  expect(await submitValidated(renderer.fields()!, { action: save })).toBe(false);
  expect(save).not.toHaveBeenCalled();
  row().cancelRename();
  expect(renderer.pendingEdits()).toBe(false);
  expect(await renderer.submit({ action: save })).toBe(true);
  row().beginRename();
  row().draft.set('Renamed');
  row().commitRename();
  expect(renderer.pendingEdits()).toBe(false);
  await fixture.whenStable();
  expect(renderer.value()).toEqual({ allowed: true });
});

it.each(['revision', 'removed', 'kind'] as const)(
  'does not transfer a pending draft after same-tick %s replacement',
  async (reason) => {
    const { fixture, renderer, row, doc } = await render();
    const previousForm = renderer.fields()!,
      save = vi.fn(async () => undefined);
    row().beginRename();
    expect(renderer.pendingEdits()).toBe(true);
    if (reason === 'revision') fixture.componentRef.setInput('host', { revision: 'two' });
    else {
      const changed = structuredClone(doc);
      changed.ui.children =
        reason === 'removed'
          ? []
          : [{ id: 'tree', kind: 'view.text', version: 1, props: { text: 'Replacement' } }];
      fixture.componentRef.setInput('document', changed);
    }
    expect(renderer.pendingEdits()).toBe(false);
    if (reason === 'revision') {
      expect(await submitValidated(previousForm, { action: save })).toBe(false);
      expect(save).not.toHaveBeenCalled();
    }
    await fixture.whenStable();
    expect(renderer.pendingEdits()).toBe(false);
  },
);

it.each(['readonly', 'disabled', 'visible'] as const)(
  'excludes and cancels a draft on same-tick %s restrictions',
  async (mode) => {
    const doc = document();
    if (mode !== 'readonly')
      doc.ui.children![0]!.rules = {
        [mode]: { op: 'eq', left: { path: '/allowed' }, right: { literal: mode === 'visible' } },
      };
    const { fixture, renderer, row } = await render(doc);
    row().beginRename();
    expect(renderer.pendingEdits()).toBe(true);
    if (mode === 'readonly') {
      const changed = structuredClone(doc);
      changed.ui.children![0]!.props!['readonly'] = true;
      fixture.componentRef.setInput('document', changed);
    } else renderer.value.set({ allowed: false });
    expect(renderer.pendingEdits()).toBe(false);
    await fixture.whenStable();
    if (mode !== 'visible') expect(row().editing()).toBeUndefined();
    expect(await submitValidated(renderer.fields()!, { action: async () => undefined })).toBe(true);
  },
);

it('does not let a late old cleanup delete a live replacement registration', async () => {
  const { renderer, doc } = await render(),
    state = signal(true);
  const id = renderer.fieldIdentity(doc.ui.children![0]!);
  const old = renderer.registerPendingEdit('tree', id, () => true);
  const current = renderer.registerPendingEdit('tree', id, state);
  old();
  expect(renderer.pendingEdits()).toBe(true);
  state.set(false);
  expect(renderer.pendingEdits()).toBe(false);
  state.set(true);
  current();
  expect(renderer.pendingEdits()).toBe(false);
});

it.each(['renderer', 'strict'] as const)(
  'does not confirm an asynchronous %s submission when a draft starts before it settles',
  async (mode) => {
    const { renderer, row } = await render();
    let finish: (() => void) | undefined;
    const options = {
      action: () =>
        new Promise<undefined>((resolve) => {
          finish = () => resolve(undefined);
        }),
    };
    const attempt =
      mode === 'renderer' ? renderer.submit(options) : submitValidated(renderer.fields()!, options);
    await expect.poll(() => typeof finish).toBe('function');
    row().beginRename();
    expect(renderer.pendingEdits()).toBe(true);
    finish!();
    expect(await attempt).toBe(false);
  },
);
