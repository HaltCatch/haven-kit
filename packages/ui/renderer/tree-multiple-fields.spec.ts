import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatDialogHarness } from '@angular/material/dialog/testing';
import { MatTreeHarness } from '@angular/material/tree/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { HavenTreeMultiselectField } from '@haven/ui/tree';
import { ActionRegistry } from '@haven/runtime';
import type { HavenDocument, JsonObject } from '@haven/schema';
import { fieldAt } from '@haven/ui/form-state';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { HavenRenderer } from './renderer';
import { setupTreeSelection } from '../../../tests/ui/tree-selection-support';
beforeEach(setupTreeSelection);
afterEach(() => TestBed.resetTestingModule());
function document(type: 'string' | 'number' = 'number'): HavenDocument {
  const key = (n: number) => (type === 'number' ? n : String(n));
  return {
    schemaVersion: '1.0',
    id: 'tree-multiple-model',
    title: 'Tree multi',
    theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
    actions: {},
    resources: {},
    dataSchema: {
      type: 'object',
      required: ['keys'],
      properties: { keys: { type: 'array', items: { type }, minItems: 1, maxItems: 2 } },
    },
    ui: {
      id: 'multi',
      kind: 'field.tree-multiselect',
      version: 1,
      bind: '/keys',
      props: {
        label: 'Tree multiple',
        nodes: [
          {
            key: 'branch',
            label: 'Branch',
            children: [
              { key: key(0), label: 'Zero' },
              { key: key(1), label: 'One', disabled: true },
              { key: key(2), label: 'Two' },
            ],
          },
        ],
        leafOnly: true,
      },
    },
  };
}
async function create(d = document(), value: JsonObject = { keys: [0] }) {
  const f = TestBed.createComponent(HavenRenderer);
  f.componentRef.setInput('document', d);
  f.componentRef.setInput('value', value);
  await f.whenStable();
  expect(f.componentInstance.validation().diagnostics).toEqual([]);
  return {
    f,
    field: () => fieldAt(f.componentInstance.fields()!, '/keys')!(),
    control: () =>
      f.debugElement.query(By.directive(HavenTreeMultiselectField))
        .componentInstance as HavenTreeMultiselectField,
  };
}
it.each(['number', 'string'] as const)(
  'keeps typed %s arrays and native required/min/max/items validation',
  async (type) => {
    const key = (n: number) => (type === 'number' ? n : String(n)),
      d = document(type);
    const { f, field, control } = await create(d, { keys: [key(0), key(1)] });
    expect(field().valid()).toBe(true);
    f.componentInstance.value.set({ keys: [key(0), key(0)] });
    await f.whenStable();
    expect(field().invalid()).toBe(true);
    expect(control().value()).toEqual([key(0), key(0)]);
    f.componentInstance.value.set({ keys: [key(0), key(1), key(2)] });
    await f.whenStable();
    expect(
      field()
        .errors()
        .some((e) => e.kind === 'maxItems'),
    ).toBe(true);
    f.componentInstance.value.set({ keys: [type === 'number' ? '0' : 0] });
    await f.whenStable();
    expect(field().invalid()).toBe(true);
    f.componentInstance.value.set({ keys: [key(99)] });
    await f.whenStable();
    expect(field().invalid()).toBe(true);
    expect(control().display()).toBe('99');
    const updated = structuredClone(d);
    (
      updated.ui.props!['nodes'] as {
        key: string;
        label: string;
        children: { key: string | number; label: string }[];
      }[]
    )[0]!.children.push({ key: key(99), label: 'Restored' });
    f.componentRef.setInput('document', updated);
    await f.whenStable();
    expect(field().valid()).toBe(true);
    expect(control().value()).toEqual([key(99)]);
    control().clear();
    await f.whenStable();
    expect(f.componentInstance.value()['keys']).toEqual([]);
    expect(field().invalid()).toBe(true);
  },
);
it('uses real model change actions once on Apply, clears explicitly and cancels on owner replacement', async () => {
  const d = document();
  d.actions = { changed: { handler: 'test.treeChange' } };
  d.ui.events = { change: ['changed'] };
  const registry = new ActionRegistry(),
    events: unknown[] = [];
  registry.register({
    id: 'test.treeChange',
    execute: async (_input, context) => {
      events.push(context.event);
      return { status: 'success' };
    },
  });
  const { f, control } = await create(d);
  f.componentRef.setInput('host', { actions: registry, revision: 'one' });
  await f.whenStable();
  const overlay = TestbedHarnessEnvironment.documentRootLoader(f);
  control().open();
  const dialog = await overlay.getHarness(MatDialogHarness);
  const tree = await dialog.getHarness(MatTreeHarness);
  await (await (await tree.getNodes({ text: 'Two' }))[0]!.host()).click();
  expect(events).toEqual([]);
  await (await dialog.getHarness(MatButtonHarness.with({ text: 'Apply selection' }))).click();
  await expect.poll(() => f.componentInstance.value()['keys']).toEqual([0, 2]);
  await expect.poll(() => events.length).toBe(1);
  expect(events[0]).toEqual({ type: 'change', value: [0, 2] });
  control().open();
  await overlay.getHarness(MatDialogHarness);
  f.componentRef.setInput('host', { actions: registry, revision: 'two' });
  await f.whenStable();
  await expect.poll(() => overlay.hasHarness(MatDialogHarness)).toBe(false);
  await expect.poll(() => f.componentInstance.value()['keys']).toEqual([0, 2]);
  control().clear();
  await f.whenStable();
  await expect.poll(() => events.length).toBe(2);
  expect(events[1]).toEqual({ type: 'change', value: [] });
});

it('connects opt-in leaf cascade without persisting structural branch keys', async () => {
  const d = document();
  d.ui.props!['cascade'] = true;
  const { f, control, field } = await create(d);
  expect(control().cascade()).toBe(true);
  const overlay = TestbedHarnessEnvironment.documentRootLoader(f);
  control().open();
  const dialog = await overlay.getHarness(MatDialogHarness);
  const tree = await dialog.getHarness(MatTreeHarness);
  const branch = (await tree.getNodes({ text: 'Branch' }))[0]!;
  expect(await (await branch.host()).getAttribute('aria-checked')).toBe('mixed');
  await (await branch.host()).click();
  expect(f.componentInstance.value()['keys']).toEqual([0]);
  await (await dialog.getHarness(MatButtonHarness.with({ text: 'Apply selection' }))).click();
  await f.whenStable();
  await expect.poll(() => f.componentInstance.value()['keys']).toEqual([0, 2]);
  expect(field().valid()).toBe(true);
});
