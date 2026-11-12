import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { setupTreeSelection } from '../../../../tests/ui/tree-selection-support';
import { createEditor } from '../../../../tests/ui/tree-editor-support';

beforeEach(setupTreeSelection);
afterEach(() => TestBed.resetTestingModule());

it('keeps a live rename through equivalent capability arrays and locale changes while displaying latest action labels', async () => {
  const { fixture, component, proposals } = await createEditor();
  const row = component.rows().find((row) => row.node().key === 'leaf')!,
    owner = component.owner();
  row.beginRename();
  row.draft.set('Kept draft');
  expect(component.pendingEdits()).toBe(true);
  fixture.componentRef.setInput('fixedKeys', ['root']);
  fixture.componentRef.setInput('actions', [
    {
      id: 'host.inspect',
      disabled: false,
      label: { default: 'Latest inspect', translations: { 'zh-CN': '新版检查' } },
    },
  ]);
  expect(component.owner()).toBe(owner);
  expect(component.pendingEdits()).toBe(true);
  TestBed.inject(TranslocoService).setActiveLang('zh-CN');
  await fixture.whenStable();
  expect(row.editing()).toBeDefined();
  expect(row.draft()).toBe('Kept draft');
  expect(component.pendingEdits()).toBe(true);
  row.commitRename();
  expect(proposals[0]).toMatchObject({ type: 'rename', label: 'Kept draft', locale: 'en-US' });
  expect(component.pendingEdits()).toBe(false);
  await fixture.whenStable();
  row.openMenu();
  await fixture.whenStable();
  expect(document.querySelector('[role="menu"]')!.textContent).toContain('新版检查');
});

it.each(['readonly', 'disabled', 'fixedKeys', 'nodes', 'actions'] as const)(
  'does not begin a new rename from an old row before same-tick %s input propagation',
  async (property) => {
    const { fixture, component } = await createEditor();
    const row = component.rows().find((row) => row.node().key === 'leaf')!;
    fixture.componentRef.setInput(
      property,
      {
        readonly: true,
        disabled: true,
        fixedKeys: ['root', 'leaf'],
        nodes: structuredClone(component.nodes()),
        actions: [{ id: 'host.inspect', label: 'Inspect', disabled: true }],
      }[property],
    );
    row.beginRename();
    expect(row.editing()).toBeUndefined();
    expect(component.pendingEdits()).toBe(false);
    await fixture.whenStable();
  },
);

it('invalidates an existing draft when action permissions change, even before row inputs update', async () => {
  const { fixture, component, proposals } = await createEditor();
  const row = component.rows().find((row) => row.node().key === 'leaf')!;
  row.beginRename();
  row.draft.set('Must not submit');
  expect(component.pendingEdits()).toBe(true);
  fixture.componentRef.setInput('actions', [
    { id: 'host.inspect', label: 'Inspect', disabled: true },
  ]);
  expect(component.pendingEdits()).toBe(false);
  row.commitRename();
  expect(proposals).toEqual([]);
  await fixture.whenStable();
  expect(row.editing()).toBeUndefined();
});

it.each([
  ['fixedKeys', ['root', 'root']],
  [
    'actions',
    [
      { id: 'same', label: 'First' },
      { id: 'same', label: 'Second' },
    ],
  ],
  ['actions', Array.from({ length: 33 }, (_, i) => ({ id: `action.${i}`, label: 'Inspect' }))],
  ['actions', [{ id: 'host.inspect', label: 'x'.repeat(4097) }]],
  ['movable', 'true'],
  ['fixedKeys', undefined],
] as const)(
  'diagnoses malformed %s input rather than hiding it behind semantic owner equality',
  async (property, value) => {
    const { fixture, component } = await createEditor();
    fixture.componentRef.setInput(property, value);
    expect(component.valid()).toBe(false);
    expect(component.pendingEdits()).toBe(false);
    await fixture.whenStable();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')!.textContent,
    ).toContain('configuration is invalid');
  },
);
