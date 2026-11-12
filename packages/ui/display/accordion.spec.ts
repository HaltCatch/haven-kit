import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ComponentHarness, TestKey } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatExpansionPanelHarness } from '@angular/material/expansion/testing';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { provideHavenTransloco } from '@haven/ui/i18n';
import { HavenPanel } from '@haven/ui/page';
import english from '@haven/ui/i18n/locales/en-US.json';
import chinese from '@haven/ui/i18n/locales/zh-CN.json';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HavenAccordion } from './accordion';

@Component({
  imports: [HavenAccordion, HavenPanel],
  template: `<haven-accordion
    [multi]="multi()"
    [disabled]="disabled()"
    [readonly]="readonly()"
    [(expandedIds)]="expanded"
  >
    <ng-template havenPanel id="first" [title]="firstTitle"
      ><input aria-label="Draft"
    /></ng-template>
    <ng-template havenPanel id="second" title="Second">Second content</ng-template>
    <ng-template havenPanel [id]="thirdId()" title="Third" [disabled]="true"
      >Disabled content</ng-template
    >
  </haven-accordion>`,
})
class Host {
  readonly thirdId = signal('third');
  readonly firstTitle = { default: 'First', translations: { 'zh-CN': '第一' } };
  readonly multi = signal(false);
  readonly disabled = signal(false);
  readonly readonly = signal(false);
  readonly expanded = signal<readonly string[]>([]);
}
class HeaderHarness extends ComponentHarness {
  static hostSelector = 'mat-expansion-panel-header';
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
  const localization = TestBed.inject(TranslocoService);
  localization.setTranslation({ haven: english }, 'en-US');
  localization.setTranslation({ haven: chinese }, 'zh-CN');
});
afterEach(() => TestBed.resetTestingModule());

describe('Material accordion with stable host-controlled panel identities', () => {
  it('uses exclusive expansion and preserves projected form state on collapse', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const panels =
      await TestbedHarnessEnvironment.loader(fixture).getAllHarnesses(MatExpansionPanelHarness);
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input')!;
    input.value = 'Unsaved draft';
    await panels[0]!.expand();
    expect(fixture.componentInstance.expanded()).toEqual(['first']);
    await panels[1]!.expand();
    expect(fixture.componentInstance.expanded()).toEqual(['second']);
    expect(await panels[0]!.isExpanded()).toBe(false);
    await panels[0]!.expand();
    expect(input.value).toBe('Unsaved draft');
    expect(await panels[2]!.isDisabled()).toBe(true);
    await panels[2]!.expand();
    expect(fixture.componentInstance.expanded()).toEqual(['first']);
  });
  it('supports multiple independent expanded IDs and reactive localized panel titles', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.multi.set(true);
    await fixture.whenStable();
    const panels =
      await TestbedHarnessEnvironment.loader(fixture).getAllHarnesses(MatExpansionPanelHarness);
    await panels[0]!.expand();
    await panels[1]!.expand();
    expect(fixture.componentInstance.expanded()).toEqual(['first', 'second']);
    await panels[0]!.collapse();
    expect(fixture.componentInstance.expanded()).toEqual(['second']);
    TestBed.inject(TranslocoService).setActiveLang('zh-CN');
    await fixture.whenStable();
    expect(await panels[0]!.getTitle()).toBe('第一');
  });
  it.each(['disabled', 'readonly'] as const)(
    'prevents header interaction under %s while retaining host state',
    async (flag) => {
      const fixture = TestBed.createComponent(Host);
      fixture.componentInstance.expanded.set(['first']);
      fixture.componentInstance[flag].set(true);
      await fixture.whenStable();
      const panels =
        await TestbedHarnessEnvironment.loader(fixture).getAllHarnesses(MatExpansionPanelHarness);
      expect(await panels[0]!.isExpanded()).toBe(true);
      expect(await panels[0]!.isDisabled()).toBe(true);
      await panels[1]!.expand();
      expect(fixture.componentInstance.expanded()).toEqual(['first']);
      fixture.componentInstance[flag].set(false);
      await fixture.whenStable();
      await panels[1]!.expand();
      expect(fixture.componentInstance.expanded()).toEqual(['second']);
    },
  );
  it('uses Material header keyboard handling for Enter, arrow navigation and Space', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const headers = await TestbedHarnessEnvironment.loader(fixture).getAllHarnesses(HeaderHarness);
    const first = await headers[0]!.host(),
      second = await headers[1]!.host();
    await first.focus();
    await first.sendKeys(TestKey.ENTER);
    expect(fixture.componentInstance.expanded()).toEqual(['first']);
    await first.sendKeys(TestKey.DOWN_ARROW);
    expect(await second.isFocused()).toBe(true);
    await second.sendKeys(' ');
    expect(fixture.componentInstance.expanded()).toEqual(['second']);
  });
  it('rejects duplicate projected panel IDs before rendering conflicting controls', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.thirdId.set('first');
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[role="alert"]')).not.toBeNull();
    expect(element.querySelector('mat-expansion-panel')).toBeNull();
    fixture.componentInstance.thirdId.set('third');
    await fixture.whenStable();
    expect(element.querySelector('[role="alert"]')).toBeNull();
  });
  it('diagnoses invalid controlled IDs without silently changing them and recovers after correction', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.expanded.set(['missing']);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).not.toBeNull();
    expect(fixture.componentInstance.expanded()).toEqual(['missing']);
    fixture.componentInstance.expanded.set(['first', 'second']);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).not.toBeNull();
    fixture.componentInstance.expanded.set(['second']);
    await fixture.whenStable();
    const panels =
      await TestbedHarnessEnvironment.loader(fixture).getAllHarnesses(MatExpansionPanelHarness);
    expect(await panels[1]!.isExpanded()).toBe(true);
  });
});
