import { TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatTreeHarness } from '@angular/material/tree/testing';
import type { HavenDocument, JsonValue } from '@haven/schema';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { setupTreeSelection } from '../../../tests/ui/tree-selection-support';
import { renderTreeEditorModel } from '../../../tests/ui/tree-editor-model-support';

beforeEach(setupTreeSelection);
afterEach(() => TestBed.resetTestingModule());
const initial = { selection: [0], expandedKeys: ['root'], filter: '' };

/** Preserve tree references to isolate view ownership from the existing source-reference guard. */
function changed(doc: HavenDocument, property: string, value: JsonValue): HavenDocument {
  return { ...doc, ui: { ...doc.ui, props: { ...doc.ui.props, [property]: value } } };
}

it('proposes controlled view edits without writing model props, form data or unaccepted visual state', async () => {
  const { f, doc, control, events } = await renderTreeEditorModel(initial);
  const baseline = structuredClone(doc);
  expect(control.activeKey()).toBe(0);
  expect(control.expandedKeys()).toEqual(['root']);
  expect(events).toEqual([]);
  control.select(control.nodes()[0]!.children![1]!);
  control.expandedKeys.set(['root', 0]);
  control.filter.set('String');
  await expect.poll(() => events.length).toBe(3);
  expect(events).toEqual([
    { type: 'activate', value: '0' },
    { type: 'expandedChange', value: ['root', 0] },
    { type: 'filterChange', value: 'String' },
  ]);
  await f.whenStable();
  expect(control.activeKey()).toBe(0);
  expect(control.expandedKeys()).toEqual(['root']);
  expect(control.filter()).toBe('');
  expect(doc).toEqual(baseline);
  expect(f.componentInstance.value()).toEqual({});
});

it('applies host-controlled typed selection, expansion and filter without synthesizing user actions', async () => {
  const { f, doc, control, events } = await renderTreeEditorModel(initial);
  f.componentRef.setInput('document', {
    ...doc,
    ui: {
      ...doc.ui,
      props: { ...doc.ui.props, selection: ['0'], expandedKeys: [], filter: 'Numeric' },
    },
  });
  await f.whenStable();
  expect(control.activeKey()).toBe('0');
  expect(control.expandedKeys()).toEqual([]);
  expect(control.filter()).toBe('Numeric');
  expect(events).toEqual([]);
});

it('restores the native search input and tree expansion when the host declines view edits', async () => {
  const { f, control, events } = await renderTreeEditorModel({ ...initial, filterable: true });
  const tree = await TestbedHarnessEnvironment.loader(f).getHarness(MatTreeHarness);
  const root = (await tree.getNodes())[0]!;
  await root.collapse();
  await f.whenStable();
  expect(await root.isExpanded()).toBe(true);
  const input = (f.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input')!;
  input.value = 'Rejected text';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await f.whenStable();
  expect(input.value).toBe('');
  expect(control.filter()).toBe('');
  await expect.poll(() => events.length).toBe(2);
  expect(events).toEqual([
    { type: 'expandedChange', value: [] },
    { type: 'filterChange', value: 'Rejected text' },
  ]);
});

it('preserves independent uncontrolled expansion and filtering when a controlled selection changes', async () => {
  const { f, doc, control, events } = await renderTreeEditorModel({ selection: [0] });
  control.expandedKeys.set(['root']);
  control.filter.set('zero');
  await expect.poll(() => events.length).toBe(2);
  f.componentRef.setInput('document', changed(doc, 'selection', ['0']));
  await f.whenStable();
  expect(control.activeKey()).toBe('0');
  expect(control.expandedKeys()).toEqual(['root']);
  expect(control.filter()).toBe('zero');
  expect(events).toHaveLength(2);
});

it.each([
  ['selection', ['0']],
  ['expandedKeys', []],
  ['filter', 'Latest'],
] as const)(
  'rejects outputs retained across a same-tick controlled %s replacement',
  async (property, value) => {
    const { f, doc, control, events } = await renderTreeEditorModel(initial);
    f.componentRef.setInput(
      'document',
      changed(doc, property, structuredClone(value) as JsonValue),
    );
    control.select(control.nodes()[0]!.children![0]!);
    control.expandedKeys.set(['root', 0]);
    control.filter.set('Stale');
    await f.whenStable();
    expect(events).toEqual([]);
    expect(control.activeKey()).toBe(property === 'selection' ? '0' : 0);
    expect(control.expandedKeys()).toEqual(property === 'expandedKeys' ? [] : ['root']);
    expect(control.filter()).toBe(property === 'filter' ? 'Latest' : '');
  },
);

it('rejects view changes after permissions are disabled in the parent before child propagation', async () => {
  const { f, doc, control, events } = await renderTreeEditorModel(initial);
  f.componentRef.setInput('document', {
    ...doc,
    ui: {
      ...doc.ui,
      rules: { disabled: { op: 'eq', left: { literal: true }, right: { literal: true } } },
    },
  });
  control.select(control.nodes()[0]!.children![1]!);
  control.expandedKeys.set([]);
  control.filter.set('Stale');
  await f.whenStable();
  expect(control.activeKey()).toBe(0);
  expect(control.expandedKeys()).toEqual(['root']);
  expect(control.filter()).toBe('');
  expect(events).toEqual([]);
});
