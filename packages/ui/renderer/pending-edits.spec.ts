import { signal } from '@angular/core';
import { expect, it, vi } from 'vitest';
import { PendingEditStore } from './pending-edits';

it('reads current control signals synchronously rather than retaining a copied draft flag', () => {
  const allowed = signal(true),
    draft = signal(false),
    store = new PendingEditStore(() => allowed());
  store.register('tree', 'one', 'tree.editor', draft);
  expect(store.pending()).toBe(false);
  draft.set(true);
  expect(store.pending()).toBe(true);
  allowed.set(false);
  expect(store.pending()).toBe(false);
});

it('keeps replacement registrations when old owners or destroyed controls run their cleanup later', () => {
  const store = new PendingEditStore(() => true);
  const old = store.register('tree', 'one', 'tree.editor', () => true);
  const current = store.register('tree', 'two', 'tree.editor', () => true);
  old();
  expect(store.pending()).toBe(true);
  store.clear();
  const later = store.register('tree', 'three', 'tree.editor', () => true);
  current();
  expect(store.pending()).toBe(true);
  later();
  expect(store.pending()).toBe(false);
});

it('does not call an out-of-scope control reader when its owner, kind or permissions no longer match', () => {
  const current = signal({ identity: 'one', kind: 'tree.editor', allowed: true });
  const read = vi.fn(() => true),
    store = new PendingEditStore((_id, identity, kind) => {
      const state = current();
      return state.allowed && state.identity === identity && state.kind === kind;
    });
  store.register('tree', 'one', 'tree.editor', read);
  expect(store.pending()).toBe(true);
  expect(read).toHaveBeenCalledTimes(1);
  for (const state of [
    { identity: 'two', kind: 'tree.editor', allowed: true },
    { identity: 'one', kind: 'view.text', allowed: true },
    { identity: 'one', kind: 'tree.editor', allowed: false },
  ]) {
    current.set(state);
    expect(store.pending()).toBe(false);
  }
  expect(read).toHaveBeenCalledTimes(1);
});
