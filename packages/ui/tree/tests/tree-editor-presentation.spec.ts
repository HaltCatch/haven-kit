import { TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { By } from '@angular/platform-browser';
import { CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import { MAT_TOOLTIP_DEFAULT_OPTIONS } from '@angular/material/tooltip';
import { MatTooltipHarness } from '@angular/material/tooltip/testing';
import { TranslocoService } from '@jsverse/transloco';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { setupTreeSelection } from '../../../../tests/ui/tree-selection-support';
import { createEditor } from '../../../../tests/ui/tree-editor-support';

const tooltipDefaults = {
  showDelay: 0,
  hideDelay: 0,
  touchendHideDelay: 1234,
  disableTooltipInteractivity: false,
};
beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [{ provide: MAT_TOOLTIP_DEFAULT_OPTIONS, useValue: tooltipDefaults }],
  });
  setupTreeSelection();
});
afterEach(() => TestBed.resetTestingModule());

it('shows complete arbitrary localized node names instead of relying on clipped text and a browser title', async () => {
  const { fixture } = await createEditor();
  const english = 'A complete nested configuration name with a verylongunbrokentoken'.repeat(2);
  const chinese = '这是一个需要完整展示的多级配置节点名称';
  fixture.componentRef.setInput('nodes', [
    { key: 'long', label: { default: english, translations: { 'zh-CN': chinese } } },
  ]);
  fixture.componentRef.setInput('fixedKeys', []);
  await fixture.whenStable();
  const label = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.label')!;
  expect(label.textContent?.trim()).toBe(english);
  expect(getComputedStyle(label).whiteSpace).toBe('normal');
  expect(getComputedStyle(label).textOverflow).not.toBe('ellipsis');
  expect(label.hasAttribute('title')).toBe(false);
  TestBed.inject(TranslocoService).setActiveLang('zh-CN');
  await fixture.whenStable();
  expect(label.textContent?.trim()).toBe(chinese);
});

it('explains drag and action controls through native Material tooltips and accessible names', async () => {
  const { fixture } = await createEditor();
  const loader = TestbedHarnessEnvironment.loader(fixture);
  const drag = await loader.getHarness(
    MatTooltipHarness.with({ selector: '[data-tree-drag-handle][aria-label="Drag node: Zero"]' }),
  );
  await drag.show();
  expect(await drag.getTooltipText()).toBe('Drag node: Zero');
  await drag.hide();
  const menu = await loader.getHarness(
    MatTooltipHarness.with({ selector: '[data-tree-menu][aria-label="Node actions: Zero"]' }),
  );
  await menu.show();
  expect(await menu.getTooltipText()).toBe('Node actions: Zero');
  await menu.hide();
  TestBed.inject(TranslocoService).setActiveLang('zh-CN');
  await fixture.whenStable();
  const handle = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
    '[data-tree-drag-handle][aria-label="拖动节点: Zero"]',
  );
  expect(handle).not.toBeNull();
  expect(handle!.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
});

it('retains the origin placeholder while native CDK anchors keep receiving labels out of drag layout', async () => {
  const { fixture, component } = await createEditor();
  const lists = fixture.debugElement
    .queryAll(By.directive(CdkDropList))
    .map((entry) => entry.injector.get<CdkDropList>(CdkDropList));
  const origin = lists.find((list) => list.data === 0)!;
  const destination = lists.find((list) => list.data === 'empty')!;
  expect(lists.every((list) => list.hasAnchor)).toBe(true);
  const placeholder = origin.element.nativeElement.firstElementChild!.cloneNode(
    true,
  ) as HTMLElement;
  placeholder.classList.add('cdk-drag-placeholder');
  origin.element.nativeElement.append(placeholder);
  component.drag.start(0, origin.element.nativeElement);
  expect(origin.element.nativeElement.classList.contains('tree-drag-origin')).toBe(true);
  expect(getComputedStyle(placeholder).visibility).toBe('hidden');
  expect(getComputedStyle(placeholder).display).not.toBe('none');
  destination.element.nativeElement.append(placeholder);
  expect(getComputedStyle(placeholder).display).toBe('none');
  component.drag.end();
  await Promise.resolve();
  expect(origin.element.nativeElement.classList.contains('tree-drag-origin')).toBe(false);
  placeholder.remove();
  component.drag.start(0, origin.element.nativeElement);
  fixture.componentRef.setInput('identity', 'replacement');
  await fixture.whenStable();
  expect(origin.element.nativeElement.classList.contains('tree-drag-origin')).toBe(false);
  component.drag.start(0, origin.element.nativeElement);
  fixture.destroy();
  expect(origin.element.nativeElement.classList.contains('tree-drag-origin')).toBe(false);
});

it('keeps the collapsed expansion affordance logical in RTL and shows the full node name', async () => {
  const { fixture, component } = await createEditor();
  (fixture.nativeElement as HTMLElement).setAttribute('dir', 'rtl');
  component.expandedKeys.set([]);
  await fixture.whenStable();
  const icon = (fixture.nativeElement as HTMLElement).querySelector<SVGElement>('.expansion-icon')!;
  expect(getComputedStyle(icon).transform).toBe('rotate(180deg)');
  component.expandedKeys.set(['root']);
  await fixture.whenStable();
  expect(getComputedStyle(icon).transform).toBe('rotate(90deg)');
});

it('hides a hovered drag hint as soon as native dragging starts so the next row remains a drop target', async () => {
  const { fixture, component } = await createEditor();
  const loader = TestbedHarnessEnvironment.loader(fixture);
  const tooltip = await loader.getHarness(
    MatTooltipHarness.with({ selector: '[data-tree-drag-handle][aria-label="Drag node: Zero"]' }),
  );
  await tooltip.show();
  expect(await tooltip.isOpen()).toBe(true);
  const source = fixture.debugElement
    .queryAll(By.directive(CdkDrag))
    .map((entry) => entry.injector.get<CdkDrag>(CdkDrag))
    .find((drag) => drag.data === 0)!;
  component.startDrag({ source, event: new MouseEvent('mousedown') });
  await fixture.whenStable();
  await expect.poll(() => tooltip.isOpen()).toBe(false);
  expect(source.dropContainer.element.nativeElement.classList.contains('tree-drag-origin')).toBe(
    true,
  );
  component.drag.cancel();
});

it('makes only drag hints pointer transparent through native Material options while retaining inherited defaults', async () => {
  const { fixture } = await createEditor();
  const handle = fixture.debugElement.query(
    By.css('[data-tree-drag-handle][aria-label="Drag node: Zero"]'),
  );
  expect(handle.injector.get(MAT_TOOLTIP_DEFAULT_OPTIONS)).toEqual({
    ...tooltipDefaults,
    disableTooltipInteractivity: true,
  });
  expect(TestBed.inject(MAT_TOOLTIP_DEFAULT_OPTIONS)).toBe(tooltipDefaults);
  const loader = TestbedHarnessEnvironment.loader(fixture);
  const drag = await loader.getHarness(
    MatTooltipHarness.with({ selector: '[data-tree-drag-handle][aria-label="Drag node: Zero"]' }),
  );
  await drag.show();
  expect(
    document
      .querySelector('.mat-mdc-tooltip-panel')
      ?.classList.contains('mat-mdc-tooltip-panel-non-interactive'),
  ).toBe(true);
  await drag.hide();
  const menu = await loader.getHarness(
    MatTooltipHarness.with({ selector: '[data-tree-menu][aria-label="Node actions: Zero"]' }),
  );
  await menu.show();
  const openPanels = [...document.querySelectorAll('.mat-mdc-tooltip-panel')].filter(
    (panel) => !panel.querySelector('.mat-mdc-tooltip-hide'),
  );
  expect(openPanels).toHaveLength(1);
  expect(openPanels[0]!.classList.contains('mat-mdc-tooltip-panel-non-interactive')).toBe(false);
  fixture.destroy();
  expect(document.querySelector('.mat-mdc-tooltip')).toBeNull();
});
