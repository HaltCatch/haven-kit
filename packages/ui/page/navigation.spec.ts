import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TestKey } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatTabGroupHarness } from '@angular/material/tabs/testing';
import { MatStepperHarness } from '@angular/material/stepper/testing';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { HavenTabs, HavenStepper, HavenPanel } from '@haven/ui/page';
import { provideHavenTransloco } from '@haven/ui/i18n';
import type { LocalizedText } from '@haven/schema';
import english from '@haven/ui/i18n/locales/en-US.json';
import chinese from '@haven/ui/i18n/locales/zh-CN.json';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

type Panel = {
  id: string;
  title: string | LocalizedText;
  disabled: boolean;
  valid: boolean;
  optional: boolean;
};
const initialPanels = (): Panel[] => [
  {
    id: 'first',
    title: { default: 'First', translations: { 'zh-CN': '第一' } },
    disabled: false,
    valid: true,
    optional: false,
  },
  { id: 'second', title: 'Second', disabled: false, valid: true, optional: false },
  { id: 'third', title: 'Third', disabled: false, valid: true, optional: false },
];
@Component({
  imports: [HavenTabs, HavenPanel],
  template: `<haven-tabs title="Panels" [(activeId)]="active">
    @for (panel of panels(); track panel.id) {
      <ng-template havenPanel [id]="panel.id" [title]="panel.title" [disabled]="panel.disabled">
        <input [attr.aria-label]="'Input ' + panel.id" />
      </ng-template>
    }
  </haven-tabs>`,
})
class TabsHost {
  readonly active = signal<string | null>('first');
  readonly panels = signal(initialPanels());
}
@Component({
  imports: [HavenStepper, HavenPanel],
  template: `<haven-stepper
    title="Steps"
    [(activeId)]="active"
    [linear]="linear()"
    (attempted)="attempts.push($event)"
  >
    @for (panel of panels(); track panel.id) {
      <ng-template
        havenPanel
        [id]="panel.id"
        [title]="panel.title"
        [disabled]="panel.disabled"
        [valid]="panel.valid"
        [optional]="panel.optional"
      >
        <input [attr.aria-label]="'Input ' + panel.id" />
      </ng-template>
    }
  </haven-stepper>`,
})
class StepperHost {
  readonly active = signal<string | null>('first');
  readonly linear = signal(true);
  readonly panels = signal(initialPanels());
  readonly stepper = viewChild.required(HavenStepper);
  readonly attempts: string[] = [];
}

beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [
      provideTransloco({
        config: { defaultLang: 'en-US', availableLangs: ['en-US', 'zh-CN'], prodMode: true },
      }),
      provideHavenTransloco(),
    ],
  });
  const transloco = TestBed.inject(TranslocoService);
  transloco.setTranslation({ haven: english }, 'en-US');
  transloco.setTranslation({ haven: chinese }, 'zh-CN');
});
afterEach(() => TestBed.resetTestingModule());

describe('generic Material navigation layouts', () => {
  it('retains visited tab DOM and uses native keyboard navigation and localized labels', async () => {
    const fixture = TestBed.createComponent(TabsHost);
    fixture.componentInstance.panels.update((panels) =>
      panels.map((panel) => ({ ...panel, disabled: panel.id === 'second' })),
    );
    const group = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatTabGroupHarness);
    const root = fixture.nativeElement as HTMLElement;
    const input = root.querySelector<HTMLInputElement>('[aria-label="Input first"]')!;
    input.value = 'Retained';
    const tabs = await group.getTabs();
    expect(await tabs[1]!.isDisabled()).toBe(true);
    const first = await tabs[0]!.host();
    await first.focus();
    await first.sendKeys(TestKey.RIGHT_ARROW, TestKey.ENTER);
    // Material keeps disabled headers focusable, but never activates them.
    expect(fixture.componentInstance.active()).toBe('first');
    await (await tabs[1]!.host()).sendKeys(TestKey.RIGHT_ARROW, TestKey.ENTER);
    expect(fixture.componentInstance.active()).toBe('third');
    expect(input.isConnected).toBe(true);
    await group.selectTab({ label: 'First' });
    expect(root.querySelector('[aria-label="Input first"]')).toBe(input);
    expect(input.value).toBe('Retained');
    TestBed.inject(TranslocoService).setActiveLang('zh-CN');
    expect(await (await group.getSelectedTab()).getLabel()).toBe('第一');
  });
  it('keeps tab identity through reorder and clamps removed, disabled and empty panels', async () => {
    const fixture = TestBed.createComponent(TabsHost);
    const group = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatTabGroupHarness);
    await group.selectTab({ label: 'Third' });
    fixture.componentInstance.panels.update((panels) => [...panels].reverse());
    await fixture.whenStable();
    expect(fixture.componentInstance.active()).toBe('third');
    expect(await (await group.getSelectedTab()).getLabel()).toBe('Third');
    fixture.componentInstance.panels.update((panels) =>
      panels.filter((panel) => panel.id !== 'third'),
    );
    await fixture.whenStable();
    expect(fixture.componentInstance.active()).toBe('second');
    fixture.componentInstance.panels.update((panels) =>
      panels.map((panel) => ({ ...panel, disabled: panel.id === 'second' })),
    );
    await fixture.whenStable();
    expect(fixture.componentInstance.active()).toBe('first');
    fixture.componentInstance.panels.set([]);
    await fixture.whenStable();
    expect(fixture.componentInstance.active()).toBeNull();
    expect(await group.getTabs()).toHaveLength(0);
  });
  it('preserves tab content across all-disabled state and recovers when a panel becomes available', async () => {
    const fixture = TestBed.createComponent(TabsHost);
    const group = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatTabGroupHarness);
    const root = fixture.nativeElement as HTMLElement;
    const input = root.querySelector<HTMLInputElement>('[aria-label="Input first"]')!;
    input.value = 'Retained while disabled';
    fixture.componentInstance.panels.update((panels) =>
      panels.map((panel) => ({ ...panel, disabled: true })),
    );
    await fixture.whenStable();
    expect(fixture.componentInstance.active()).toBeNull();
    expect(input.closest<HTMLElement>('.panel')?.hidden).toBe(true);
    expect(root.querySelector('[aria-label="Input first"]')).toBe(input);
    fixture.componentInstance.panels.update((panels) =>
      panels.map((panel) => ({ ...panel, disabled: panel.id !== 'first' })),
    );
    await fixture.whenStable();
    expect(fixture.componentInstance.active()).toBe('first');
    expect(await (await group.getSelectedTab()).getLabel()).toBe('First');
    expect(input.closest<HTMLElement>('.panel')?.hidden).toBe(false);
    expect(input.value).toBe('Retained while disabled');
  });
  it('guards linear navigation, retains inputs, and clamps when earlier validity changes', async () => {
    const fixture = TestBed.createComponent(StepperHost);
    fixture.componentInstance.panels.update((panels) =>
      panels.map((panel) => ({ ...panel, valid: panel.id !== 'first' })),
    );
    const stepper = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatStepperHarness);
    const root = fixture.nativeElement as HTMLElement;
    const input = root.querySelector<HTMLInputElement>('[aria-label="Input first"]')!;
    input.value = 'Step value';
    await stepper.selectStep({ label: 'Second' });
    expect(fixture.componentInstance.active()).toBe('first');
    expect(fixture.componentInstance.attempts).toContain('first');
    fixture.componentInstance.panels.update((panels) =>
      panels.map((panel) => ({ ...panel, valid: true })),
    );
    await stepper.selectStep({ label: 'Third' });
    expect(fixture.componentInstance.active()).toBe('third');
    expect(root.querySelector('[aria-label="Input first"]')).toBe(input);
    fixture.componentInstance.panels.update((panels) =>
      panels.map((panel) => ({ ...panel, valid: panel.id !== 'first' })),
    );
    await fixture.whenStable();
    expect(fixture.componentInstance.active()).toBe('first');
    expect(await (await stepper.getSteps())[0]!.isSelected()).toBe(true);
    fixture.componentInstance.linear.set(false);
    await stepper.selectStep({ label: 'Third' });
    expect(fixture.componentInstance.active()).toBe('third');
    fixture.componentInstance.linear.set(true);
    await fixture.whenStable();
    expect(fixture.componentInstance.active()).toBe('first');
    expect(input.value).toBe('Step value');
  });
  it('keeps step IDs on reorder, allows optional invalid steps, and clamps empty steps', async () => {
    const fixture = TestBed.createComponent(StepperHost);
    fixture.componentInstance.panels.update((panels) =>
      panels.map((panel) => ({
        ...panel,
        valid: panel.id !== 'first',
        optional: panel.id === 'first',
      })),
    );
    const stepper = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatStepperHarness);
    await stepper.selectStep({ label: 'Third' });
    expect(fixture.componentInstance.active()).toBe('third');
    fixture.componentInstance.panels.update((panels) => [...panels].reverse());
    await fixture.whenStable();
    expect(fixture.componentInstance.active()).toBe('third');
    expect(await (await stepper.getSteps())[0]!.isSelected()).toBe(true);
    fixture.componentInstance.panels.update((panels) =>
      panels.filter((panel) => panel.id !== 'third'),
    );
    await fixture.whenStable();
    expect(fixture.componentInstance.active()).toBe('second');
    fixture.componentInstance.panels.set([]);
    await fixture.whenStable();
    expect(fixture.componentInstance.active()).toBeNull();
    expect(await stepper.getSteps()).toHaveLength(0);
  });
  it('reports disabled step configuration and blocks interaction without discarding DOM', async () => {
    const fixture = TestBed.createComponent(StepperHost);
    const stepper = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatStepperHarness);
    const root = fixture.nativeElement as HTMLElement;
    const input = root.querySelector<HTMLInputElement>('[aria-label="Input first"]')!;
    input.value = 'Not lost';
    fixture.componentInstance.panels.update((panels) =>
      panels.map((panel) => ({ ...panel, disabled: panel.id === 'second' })),
    );
    await fixture.whenStable();
    expect(root.querySelector('[role="alert"]')?.textContent).toMatch(/disabled/i);
    expect(root.querySelector('[inert]')).not.toBeNull();
    fixture.componentInstance.stepper().next();
    expect(fixture.componentInstance.active()).toBe('first');
    fixture.componentInstance.panels.update((panels) =>
      panels.map((panel) => ({ ...panel, disabled: false })),
    );
    await fixture.whenStable();
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(root.querySelector('[aria-label="Input first"]')).toBe(input);
    expect(input.value).toBe('Not lost');
    TestBed.inject(TranslocoService).setActiveLang('zh-CN');
    expect(await (await stepper.getSteps())[0]!.getLabel()).toContain('第一');
  });
});
