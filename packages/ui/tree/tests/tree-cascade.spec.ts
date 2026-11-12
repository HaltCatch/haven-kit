import { TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatTreeHarness } from '@angular/material/tree/testing';
import { MatDialogHarness } from '@angular/material/dialog/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonHarness } from '@angular/material/button/testing';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { indexTree } from '@haven/schema';
import type { TreeNode } from '@haven/schema';
import { HavenTree } from '../tree';
import { HavenTreeMultiselectField } from '../tree-multiselect';
import { toggleTreeCascade } from '../cascade-selection';
import { setupTreeSelection } from '../../../../tests/ui/tree-selection-support';

const nodes: TreeNode[] = [
  {
    key: 'root',
    label: 'Root',
    children: [
      {
        key: 'branch',
        label: 'Branch',
        children: [
          { key: 0, label: 'Zero' },
          { key: '0', label: 'Text zero' },
        ],
      },
      { key: 'other', label: 'Other' },
      {
        key: 'locked',
        label: 'Locked',
        disabled: true,
        children: [{ key: 'saved', label: 'Saved' }],
      },
    ],
  },
];
beforeEach(setupTreeSelection);
afterEach(() => TestBed.resetTestingModule());

it('conducts selection up and down while preserving unknown and disabled stored keys', () => {
  const index = indexTree(nodes)!;
  const baseline = ['unknown', 'saved'];
  const first = toggleTreeCascade(index, baseline, 0, false)!;
  expect(first).toEqual(['unknown', 'saved', 0]);
  const both = toggleTreeCascade(index, first, '0', false)!;
  expect(both).toEqual(['unknown', 'saved', 0, '0', 'branch']);
  const complete = toggleTreeCascade(index, both, 'other', false)!;
  expect(complete).toEqual(['unknown', 'saved', 0, '0', 'branch', 'other', 'root']);
  expect(toggleTreeCascade(index, complete, 0, false)).toEqual(['unknown', 'saved', '0', 'other']);
  expect(toggleTreeCascade(index, complete, 'root', false)).toEqual(['unknown', 'saved']);
  expect(toggleTreeCascade(index, baseline, 'locked', false)).toBeUndefined();
  expect(baseline).toEqual(['unknown', 'saved']);
});
it('rejects invalid selections and an atomic cascade exceeding the shared 5000-key limit', () => {
  const index = indexTree(nodes)!;
  expect(toggleTreeCascade(index, [0, 0], 'root', false)).toBeUndefined();
  const baseline = Array.from({ length: 5000 }, (_, n) => `unknown-${n}`);
  expect(toggleTreeCascade(index, baseline, 'root', true)).toBeUndefined();
  expect(baseline).toHaveLength(5000);
});
it('announces an atomic selection-limit rejection and clears it after external value replacement', async () => {
  const f = TestBed.createComponent(HavenTree);
  f.componentRef.setInput('nodes', nodes);
  f.componentRef.setInput('multiple', true);
  f.componentRef.setInput('cascade', true);
  const baseline = Array.from({ length: 5000 }, (_, n) => `unknown-${n}`);
  f.componentRef.setInput('selectedKeys', baseline);
  await f.whenStable();
  f.componentInstance.select(nodes[0]!);
  await f.whenStable();
  expect(f.componentInstance.selectedKeys()).toBe(baseline);
  expect(f.componentInstance.selectionLimited()).toBe(true);
  expect((f.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent).toContain(
    '5000',
  );
  f.componentRef.setInput('selectedKeys', []);
  await f.whenStable();
  expect(f.componentInstance.selectionLimited()).toBe(false);
});
it('uses full hierarchy under filtering, native keyboard activation and mixed ARIA', async () => {
  const f = TestBed.createComponent(HavenTree);
  f.componentRef.setInput('nodes', nodes);
  f.componentRef.setInput('multiple', true);
  f.componentRef.setInput('cascade', true);
  f.componentRef.setInput('selectedKeys', ['saved', 'unknown', 0]);
  const tree = await TestbedHarnessEnvironment.loader(f).getHarness(MatTreeHarness);
  const root = (await tree.getNodes({ text: 'Root' }))[0]!;
  expect(await (await root.host()).getAttribute('aria-checked')).toBe('mixed');
  f.componentInstance.filter.set('Text zero');
  await f.whenStable();
  const branch = (await tree.getNodes({ text: 'Branch' }))[0]!;
  await (await branch.host()).sendKeys(' ');
  expect(f.componentInstance.selectedKeys()).toEqual(['saved', 'unknown', 0, 'branch', '0']);
  expect(await (await branch.host()).getAttribute('aria-checked')).toBe('true');
  f.componentInstance.filter.set('');
  await f.whenStable();
  expect(
    await (await (await tree.getNodes({ text: 'Root' }))[0]!.host()).getAttribute('aria-checked'),
  ).toBe('mixed');
  expect(f.componentInstance.expandedKeys()).toEqual([]);
  f.componentRef.setInput('readonly', true);
  await (await (await tree.getNodes({ text: 'Root' }))[0]!.host()).click();
  expect(f.componentInstance.selectedKeys()).toEqual(['saved', 'unknown', 0, 'branch', '0']);
});
it('allows leaf-only parent activation without persisting branches and leaves the default independent', async () => {
  const f = TestBed.createComponent(HavenTree);
  f.componentRef.setInput('nodes', nodes);
  f.componentRef.setInput('multiple', true);
  f.componentRef.setInput('leafOnly', true);
  const tree = await TestbedHarnessEnvironment.loader(f).getHarness(MatTreeHarness);
  await (await (await tree.getNodes({ text: 'Root' }))[0]!.host()).click();
  expect(f.componentInstance.selectedKeys()).toEqual([]);
  f.componentRef.setInput('cascade', true);
  await (await (await tree.getNodes({ text: 'Root' }))[0]!.host()).click();
  expect(f.componentInstance.selectedKeys()).toEqual([0, '0', 'other']);
  expect(f.componentInstance.checkState(nodes[0]!)).toBe('checked');
  f.componentRef.setInput('disabled', true);
  f.componentInstance.select(nodes[0]!);
  expect(f.componentInstance.selectedKeys()).toEqual([0, '0', 'other']);
});
it('keeps cascade drafts transactional and rejects same-tick configuration changes', async () => {
  const f = TestBed.createComponent(HavenTreeMultiselectField);
  f.componentRef.setInput('label', 'Cascade');
  f.componentRef.setInput('nodes', nodes);
  f.componentRef.setInput('cascade', true);
  f.componentRef.setInput('leafOnly', true);
  f.componentRef.setInput('value', [0, 'saved']);
  await f.whenStable();
  const overlay = TestbedHarnessEnvironment.documentRootLoader(f);
  f.componentInstance.open();
  const dialog = await overlay.getHarness(MatDialogHarness);
  const tree = await dialog.getHarness(MatTreeHarness);
  await (await (await tree.getNodes({ text: 'Root' }))[0]!.host()).click();
  expect(f.componentInstance.value()).toEqual([0, 'saved']);
  await (await dialog.getHarness(MatButtonHarness.with({ text: 'Apply selection' }))).click();
  await expect.poll(() => f.componentInstance.value()).toEqual([0, 'saved', '0', 'other']);
  f.componentInstance.open();
  await overlay.getHarness(MatDialogHarness);
  f.componentRef.setInput('cascade', false);
  // Directly closing reproduces a completion racing the configuration effect.
  const picker = TestBed.inject(MatDialog).openDialogs[0]!;
  picker.close([]);
  await f.whenStable();
  expect(f.componentInstance.value()).toEqual([0, 'saved', '0', 'other']);
});
