import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatTreeHarness } from '@angular/material/tree/testing';
import { MatSelectHarness } from '@angular/material/select/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatDialogHarness } from '@angular/material/dialog/testing';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { provideHavenTransloco } from '@haven/ui/i18n';
import { HavenTree, HavenTreeSelectField, HavenCascaderField } from '@haven/ui/tree';
import { ActionRegistry } from '@haven/runtime';
import type { ActionContext } from '@haven/runtime';
import type { HavenDocument, TreeNode } from '@haven/schema';
import english from '@haven/ui/i18n/locales/en-US.json';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HavenRenderer } from './renderer';
import type { HavenUiEvent } from './renderer';
import { fieldAt } from '@haven/ui/form-state';

beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [
      provideTransloco({
        config: { defaultLang: 'en-US', availableLangs: ['en-US'], prodMode: true },
      }),
      provideHavenTransloco(),
    ],
  });
  TestBed.inject(TranslocoService).setTranslation({ haven: english }, 'en-US');
});
afterEach(() => TestBed.resetTestingModule());

const kinds = ['field.tree-select', 'field.cascader'] as const;
type FieldKind = (typeof kinds)[number];
function fieldDocument(kind: FieldKind, type: 'number' | 'string'): HavenDocument {
  const nodes: TreeNode[] = [
    {
      // Non-selectable ancestors deliberately have the other scalar type.
      key: type === 'number' ? 'branch' : 99,
      label: 'Branch',
      children: [
        { key: type === 'number' ? 0 : '0', label: 'Zero' },
        { key: type === 'number' ? 1 : 'one', label: 'One' },
      ],
    },
  ];
  return {
    schemaVersion: '1.0',
    id: `${kind}-${type}`,
    title: 'Tree field',
    dataSchema: { type: 'object', properties: { choice: { type } } },
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
          props: {
            label: 'Choice',
            nodes,
            ...(kind === 'field.tree-select' ? { leafOnly: true } : {}),
          },
        },
      ],
    },
    actions: {},
    resources: {},
    theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
  };
}
async function fieldFixture(kind: FieldKind, type: 'number' | 'string') {
  const fixture = TestBed.createComponent(HavenRenderer);
  const model = fieldDocument(kind, type);
  fixture.componentRef.setInput('document', model);
  fixture.componentRef.setInput('value', { choice: type === 'number' ? 0 : '0' });
  await fixture.whenStable();
  expect(fixture.componentInstance.validation().diagnostics).toEqual([]);
  const field = () => fieldAt(fixture.componentInstance.fields()!, '/choice')!();
  return { fixture, model, field };
}

describe('JSON-driven local tree fields', () => {
  for (const kind of kinds) {
    it.each(['number', 'string'] as const)(
      `${kind} preserves a typed %s zero, validates unknown keys and revalidates nodes`,
      async (type) => {
        const { fixture, model, field } = await fieldFixture(kind, type);
        const zero = type === 'number' ? 0 : '0';
        const unknown = type === 'number' ? 42 : 'missing';
        expect(field().valid()).toBe(true);
        expect(fixture.componentInstance.value()['choice']).toBe(zero);
        if (kind === 'field.tree-select') {
          const control = fixture.debugElement.query(By.directive(HavenTreeSelectField))
            .componentInstance as HavenTreeSelectField;
          expect(control.filterable()).toBe(true);
          expect(control.leafOnly()).toBe(true);
        } else {
          const control = fixture.debugElement.query(By.directive(HavenCascaderField))
            .componentInstance as HavenCascaderField;
          expect(control.filterable()).toBe(true);
        }
        fixture.componentInstance.value.set({ choice: unknown });
        await fixture.whenStable();
        expect(field().valid()).toBe(false);
        expect(fixture.componentInstance.value()['choice']).toBe(unknown);
        const expanded = structuredClone(model);
        const changedNodes = expanded.ui.children![0]!.props!['nodes'] as TreeNode[];
        changedNodes[0]!.children!.push({ key: unknown, label: 'Recovered' });
        fixture.componentRef.setInput('document', expanded);
        await fixture.whenStable();
        expect(field().valid()).toBe(true);
        expect(fixture.componentInstance.value()['choice']).toBe(unknown);
        fixture.componentRef.setInput('document', model);
        await fixture.whenStable();
        expect(field().valid()).toBe(false);
        expect(fixture.componentInstance.value()['choice']).toBe(unknown);
        const loader = TestbedHarnessEnvironment.loader(fixture);
        if (kind === 'field.tree-select') {
          const overlay = TestbedHarnessEnvironment.documentRootLoader(fixture);
          await (await loader.getHarness(MatButtonHarness.with({ text: 'Choose a node' }))).click();
          const tree = await overlay.getHarness(MatTreeHarness);
          await (await tree.getNodes({ text: /Branch/ }))[0]!.expand();
          await (await (await tree.getNodes({ text: /Zero/ }))[0]!.host()).click();
          await expect.poll(() => overlay.hasHarness(MatDialogHarness)).toBe(false);
        } else {
          await (
            await loader.getAllHarnesses(MatSelectHarness)
          )[0]!.clickOptions({ text: 'Branch' });
          expect(fixture.componentInstance.value()['choice']).toBe(unknown);
          await (await loader.getAllHarnesses(MatSelectHarness))[1]!.clickOptions({ text: 'Zero' });
        }
        await expect.poll(() => fixture.componentInstance.value()['choice']).toBe(zero);
        expect(field().valid()).toBe(true);
      },
    );
    it.each(['number', 'string'] as const)(
      `${kind} rejects disabled keys with the wrong %s binding type without clearing saved values`,
      async (type) => {
        const { fixture, model, field } = await fieldFixture(kind, type);
        const edited = structuredClone(model);
        const nodes = edited.ui.children![0]!.props!['nodes'] as TreeNode[];
        nodes[0]!.children![1]!.disabled = true;
        const wrong = type === 'number' ? '0' : 0;
        const sameType = type === 'number' ? 1 : 'one';
        nodes[0]!.children!.push({ key: wrong, label: 'Disabled wrong type', disabled: true });
        fixture.componentRef.setInput('document', edited);
        await fixture.whenStable();
        expect(fixture.componentInstance.validation().diagnostics).toEqual([]);
        fixture.componentInstance.value.set({ choice: wrong });
        await fixture.whenStable();
        expect(field().valid()).toBe(false);
        expect(
          field()
            .errors()
            .map((error) => error.kind),
        ).toContain('option');
        expect(fixture.componentInstance.value()['choice']).toBe(wrong);
        fixture.componentInstance.value.set({ choice: sameType });
        await fixture.whenStable();
        expect(field().valid()).toBe(true);
        expect(fixture.componentInstance.value()['choice']).toBe(sameType);
      },
    );
    it(`${kind} preserves unknown values across node removal and resets controls on revision changes`, async () => {
      const { fixture, model, field } = await fieldFixture(kind, 'number');
      const component = kind === 'field.tree-select' ? HavenTreeSelectField : HavenCascaderField;
      const control = () => fixture.debugElement.query(By.directive(component)).componentInstance;
      const original = control();
      fixture.componentInstance.value.set({ choice: 42 });
      await fixture.whenStable();
      const cosmetic = structuredClone(model);
      cosmetic.ui.children![0]!.props!['label'] = 'Renamed';
      cosmetic.theme.mode = 'light';
      fixture.componentRef.setInput('document', cosmetic);
      await fixture.whenStable();
      expect(control()).toBe(original);
      expect(field().valid()).toBe(false);
      expect(fixture.componentInstance.value()['choice']).toBe(42);
      fixture.componentRef.setInput('host', { revision: 'next' });
      await fixture.whenStable();
      expect(control()).not.toBe(original);
      expect(field().touched()).toBe(false);
      expect(field().dirty()).toBe(false);
      expect(field().valid()).toBe(false);
      expect(fixture.componentInstance.value()['choice']).toBe(42);
      fixture.componentRef.setInput('document', { ...model, ui: { ...model.ui, children: [] } });
      await fixture.whenStable();
      expect(fixture.debugElement.query(By.directive(component))).toBeNull();
      expect(fixture.componentInstance.value()['choice']).toBe(42);
      fixture.componentRef.setInput('document', model);
      await fixture.whenStable();
      expect(control()).not.toBe(original);
      expect(field().valid()).toBe(false);
      expect(fixture.componentInstance.value()['choice']).toBe(42);
    });
    it(`${kind} applies model readonly and disabled policies without changing saved values`, async () => {
      const { fixture, model, field } = await fieldFixture(kind, 'number');
      const readonlyModel = structuredClone(model);
      readonlyModel.ui.children![0]!.props!['readonly'] = true;
      fixture.componentRef.setInput('document', readonlyModel);
      await fixture.whenStable();
      expect(field().readonly()).toBe(true);
      const loader = TestbedHarnessEnvironment.loader(fixture);
      const isBlocked = async () =>
        kind === 'field.tree-select'
          ? (await loader.getHarness(MatButtonHarness.with({ text: 'Choose a node' }))).isDisabled()
          : (await loader.getAllHarnesses(MatSelectHarness))[0]!.isDisabled();
      expect(await isBlocked()).toBe(true);
      const disabledModel = structuredClone(model);
      disabledModel.ui.children![0]!.rules = {
        disabled: { op: 'eq', left: { literal: true }, right: { literal: true } },
      };
      fixture.componentRef.setInput('document', disabledModel);
      await fixture.whenStable();
      expect(field().disabled()).toBe(true);
      expect(await isBlocked()).toBe(true);
      expect(fixture.componentInstance.value()['choice']).toBe(0);
      fixture.componentRef.setInput('document', model);
      await fixture.whenStable();
      expect(field().disabled()).toBe(false);
      expect(field().readonly()).toBe(false);
      expect(await isBlocked()).toBe(false);
      expect(fixture.componentInstance.value()['choice']).toBe(0);
    });
  }

  it('routes native navigation activation, expansion and filtering through uiEvent and host actions', async () => {
    const fixture = TestBed.createComponent(HavenRenderer);
    const contexts: ActionContext[] = [],
      events: HavenUiEvent[] = [];
    const actions = new ActionRegistry();
    actions.register({
      id: 'test.tree',
      execute: async (_input, context) => {
        contexts.push(context);
        return { status: 'success' };
      },
    });
    const model: HavenDocument = {
      schemaVersion: '1.0',
      id: 'tree-navigation',
      title: 'Navigation',
      dataSchema: { type: 'object', properties: {} },
      ui: {
        id: 'tree',
        kind: 'tree',
        version: 1,
        props: {
          title: 'Tree',
          nodes: [
            {
              key: 'branch',
              label: 'Branch',
              children: [
                { key: 0, label: 'Numeric zero' },
                { key: '0', label: 'String zero' },
              ],
            },
          ],
        },
        events: { activate: ['run'], expandedChange: ['run'], filterChange: ['run'] },
      },
      actions: { run: { handler: 'test.tree' } },
      resources: {},
      theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
    };
    fixture.componentRef.setInput('document', model);
    fixture.componentRef.setInput('host', { actions, revision: 'tree:1' });
    fixture.componentRef.setInput('value', {});
    fixture.componentInstance.uiEvent.subscribe((event) => events.push(event));
    await fixture.whenStable();
    expect(fixture.componentInstance.validation().diagnostics).toEqual([]);
    const control = fixture.debugElement.query(By.directive(HavenTree))
      .componentInstance as HavenTree;
    expect(control.filterable()).toBe(false);
    const filterable = structuredClone(model);
    filterable.ui.props!['filterable'] = true;
    fixture.componentRef.setInput('document', filterable);
    const tree = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatTreeHarness);
    await (await tree.getNodes({ text: /Branch/ }))[0]!.expand();
    await expect.poll(() => contexts.length).toBe(1);
    expect(events[0]).toEqual({ nodeId: 'tree', event: 'expandedChange', value: ['branch'] });
    await (await (await tree.getNodes({ text: 'Numeric zero' }))[0]!.host()).click();
    await expect.poll(() => contexts.length).toBe(2);
    expect(events[1]).toEqual({ nodeId: 'tree', event: 'activate', value: 0 });
    await (await (await tree.getNodes({ text: 'String zero' }))[0]!.host()).click();
    await expect.poll(() => contexts.length).toBe(3);
    expect(events[2]).toEqual({ nodeId: 'tree', event: 'activate', value: '0' });
    const search = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      'haven-tree input',
    )!;
    search.value = 'Numeric';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await expect.poll(() => contexts.length).toBe(4);
    expect(events[3]).toEqual({ nodeId: 'tree', event: 'filterChange', value: 'Numeric' });
    expect(contexts.map((context) => context.event)).toEqual(
      events.map((event) => ({ type: event.event, value: event.value })),
    );
    const cosmetic = structuredClone(filterable);
    cosmetic.ui.props!['title'] = 'Renamed tree';
    cosmetic.theme.mode = 'light';
    fixture.componentRef.setInput('document', cosmetic);
    await fixture.whenStable();
    expect(fixture.debugElement.query(By.directive(HavenTree)).componentInstance).toBe(control);
    expect(control.filter()).toBe('Numeric');
    expect(control.expandedKeys()).toEqual(['branch']);
    expect(control.activeKey()).toBe('0');
    fixture.componentRef.setInput('host', { actions, revision: 'tree:2' });
    await fixture.whenStable();
    const replacement = fixture.debugElement.query(By.directive(HavenTree))
      .componentInstance as HavenTree;
    expect(replacement).not.toBe(control);
    expect(replacement.filter()).toBe('');
    expect(replacement.expandedKeys()).toEqual([]);
    expect(replacement.activeKey()).toBeNull();
    expect(events).toHaveLength(4);
    for (const context of contexts) {
      expect(context.documentId).toBe('tree-navigation');
      expect(context.revision).toBe('tree:1');
      expect(context.selection).toEqual([]);
      expect(Object.isFrozen(context.event)).toBe(true);
    }
  });
});
