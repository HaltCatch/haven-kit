import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatDialogHarness } from '@angular/material/dialog/testing';
import { MatTreeHarness } from '@angular/material/tree/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { HavenTreeMultiselectField } from '../tree-multiselect';
import { setupTreeSelection, selectionNodes } from '../../../../tests/ui/tree-selection-support';
beforeEach(setupTreeSelection);
afterEach(() => TestBed.resetTestingModule());
async function create(value: unknown = []) {
  const f = TestBed.createComponent(HavenTreeMultiselectField);
  f.componentRef.setInput('label', 'Categories');
  f.componentRef.setInput('nodes', selectionNodes);
  f.componentRef.setInput('value', value);
  await f.whenStable();
  return f;
}
it('commits only on Apply, cancels with native Escape, and preserves stale/disabled selections', async () => {
  const f = await create(['missing', 'child']);
  const host = TestbedHarnessEnvironment.documentRootLoader(f);
  f.componentInstance.open();
  const dialog = await host.getHarness(MatDialogHarness);
  const tree = await dialog.getHarness(MatTreeHarness);
  await (await tree.getNodes({ text: 'Group' }))[0]!.expand();
  await (await (await tree.getNodes({ text: 'Zero' }))[0]!.host()).click();
  await (await (await tree.getNodes({ text: 'String zero' }))[0]!.host()).click();
  expect(f.componentInstance.value()).toEqual(['missing', 'child']);
  await (await dialog.getHarness(MatButtonHarness.with({ text: 'Apply selection' }))).click();
  await expect.poll(() => f.componentInstance.value()).toEqual(['missing', 'child', 0, '0']);
  f.componentInstance.open();
  const cancelled = await host.getHarness(MatDialogHarness);
  const second = await cancelled.getHarness(MatTreeHarness);
  await (await (await second.getNodes({ text: 'Zero' }))[0]!.host()).click();
  await cancelled.close();
  await expect.poll(() => f.componentInstance.value()).toEqual(['missing', 'child', 0, '0']);
  f.componentInstance.clear();
  expect(f.componentInstance.value()).toEqual([]);
});
it.each(['readonly', 'disabled', 'identity', 'nodes', 'value', 'leafOnly'] as const)(
  'rejects stale dialog results after synchronous %s replacement',
  async (input) => {
    const f = await create([0]);
    f.componentInstance.open();
    await f.whenStable();
    const ref = TestBed.inject(MatDialog).openDialogs[0]!;
    f.componentRef.setInput(
      input,
      input === 'identity'
        ? 'replacement'
        : input === 'nodes'
          ? structuredClone(selectionNodes)
          : input === 'value'
            ? ['0']
            : true,
    );
    ref.close(['0']);
    await f.whenStable();
    expect(f.componentInstance.value()).toEqual(input === 'value' ? ['0'] : [0]);
    await expect.poll(() => TestBed.inject(MatDialog).openDialogs.length).toBe(0);
    expect(f.componentInstance.value()).toEqual(input === 'value' ? ['0'] : [0]);
  },
);
it('keeps malformed input intact with diagnostics and handles initial readonly and disabled', async () => {
  const f = await create([0, 0]);
  expect((f.nativeElement as HTMLElement).textContent).toContain('unknown, duplicate');
  f.componentInstance.open();
  expect(TestBed.inject(MatDialog).openDialogs).toHaveLength(0);
  expect(f.componentInstance.value()).toEqual([0, 0]);
  f.componentInstance.clear();
  f.componentRef.setInput('value', [0]);
  f.componentRef.setInput('readonly', true);
  await f.whenStable();
  f.componentInstance.open();
  f.componentInstance.clear();
  expect(f.componentInstance.value()).toEqual([0]);
  f.componentRef.setInput('readonly', false);
  f.componentRef.setInput('disabled', true);
  await f.whenStable();
  f.componentInstance.open();
  f.componentInstance.clear();
  expect(f.componentInstance.value()).toEqual([0]);
});

it('diagnoses sparse input without opening a picker or normalizing the host value', async () => {
  const sparse = [0];
  Reflect.deleteProperty(sparse, '0');
  const f = await create(sparse);
  expect(f.componentInstance.validValue()).toBe(false);
  expect((f.nativeElement as HTMLElement).textContent).toContain('unknown, duplicate');
  expect(
    (f.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-picker]')!.disabled,
  ).toBe(true);
  f.componentInstance.open();
  expect(TestBed.inject(MatDialog).openDialogs).toHaveLength(0);
  expect(f.componentInstance.value()).toBe(sparse);
  expect(Object.hasOwn(f.componentInstance.value(), 0)).toBe(false);
  f.componentInstance.clear();
  expect(f.componentInstance.value()).toEqual([]);
});
