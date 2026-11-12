import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatCardHarness } from '@angular/material/card/testing';
import { MatProgressBarHarness } from '@angular/material/progress-bar/testing';
import { MatDividerHarness } from '@angular/material/divider/testing';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { provideHavenTransloco } from '@haven/ui/i18n';
import type { LocalizedText } from '@haven/schema';
import english from '@haven/ui/i18n/locales/en-US.json';
import chinese from '@haven/ui/i18n/locales/zh-CN.json';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  HavenCard,
  HavenCardActions,
  HavenBadge,
  HavenProgress,
  HavenAlert,
  HavenDivider,
} from './public-api';

const title: LocalizedText = { default: 'Activity', translations: { 'zh-CN': '活动' } };
@Component({
  imports: [HavenCard, HavenCardActions],
  template: `<haven-card [title]="title" subtitle="Description"
    ><p>Body content</p>
    <button havenCardActions type="button" (click)="actions.update(increment)">Action</button>
  </haven-card>`,
})
class CardHost {
  readonly title = title;
  readonly actions = signal(0);
  readonly increment = (value: number) => value + 1;
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
  const service = TestBed.inject(TranslocoService);
  service.setTranslation({ haven: english }, 'en-US');
  service.setTranslation({ haven: chinese }, 'zh-CN');
});
afterEach(() => TestBed.resetTestingModule());

describe('display components as independent Angular components', () => {
  it('projects a card body and host actions into their native Material slots and updates localized titles', async () => {
    const fixture = TestBed.createComponent(CardHost);
    await fixture.whenStable();
    const card = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatCardHarness);
    expect(await card.getTitleText()).toBe('Activity');
    expect(await card.getSubtitleText()).toBe('Description');
    expect(await card.getText()).toContain('Body content');
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('mat-card-content button')).toBeNull();
    element.querySelector<HTMLButtonElement>('mat-card-actions button')!.click();
    expect(fixture.componentInstance.actions()).toBe(1);
    TestBed.inject(TranslocoService).setActiveLang('zh-CN');
    await fixture.whenStable();
    expect(await card.getTitleText()).toBe('活动');
    expect(element.querySelector('mat-card')?.getAttribute('aria-label')).toBe('活动');
  });
  it('does not render empty card heading or action slots', async () => {
    const fixture = TestBed.createComponent(HavenCard);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('mat-card-header')).toBeNull();
    expect(element.querySelector('mat-card-actions')).toBeNull();
  });
  it('shows a localized textual status without a business dictionary or editable chip semantics', async () => {
    const fixture = TestBed.createComponent(HavenBadge);
    fixture.componentRef.setInput('text', title);
    fixture.componentRef.setInput('tone', 'success');
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.getAttribute('data-tone')).toBe('success');
    expect(element.textContent).toContain('Activity');
    expect(element.querySelector('[role]')).toBeNull();
    fixture.componentRef.setInput('announce', true);
    TestBed.inject(TranslocoService).setActiveLang('zh-CN');
    await fixture.whenStable();
    expect(element.querySelector('[role="status"]')?.textContent).toBe('活动');
    expect(element.querySelector('button,input')).toBeNull();
  });
  it('exposes bounded determinate progress and localized percent text to assistive technology', async () => {
    const fixture = TestBed.createComponent(HavenProgress);
    fixture.componentRef.setInput('label', title);
    fixture.componentRef.setInput('value', 12.5);
    await fixture.whenStable();
    const progress =
      await TestbedHarnessEnvironment.loader(fixture).getHarness(MatProgressBarHarness);
    expect(await progress.getMode()).toBe('determinate');
    expect(await progress.getValue()).toBe(12.5);
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[role="progressbar"]')?.getAttribute('aria-valuetext')).toBe(
      '12.5%',
    );
    TestBed.inject(TranslocoService).setActiveLang('zh-CN');
    await fixture.whenStable();
    expect(element.querySelector('[role="progressbar"]')?.getAttribute('aria-label')).toBe('活动');
    fixture.componentRef.setInput('value', 0);
    await fixture.whenStable();
    expect(await progress.getValue()).toBe(0);
    fixture.componentRef.setInput('value', 100);
    await fixture.whenStable();
    expect(await progress.getValue()).toBe(100);
  });
  it('treats unknown progress as indeterminate without announcing a fabricated percentage', async () => {
    const fixture = TestBed.createComponent(HavenProgress);
    await fixture.whenStable();
    const progress =
      await TestbedHarnessEnvironment.loader(fixture).getHarness(MatProgressBarHarness);
    expect(await progress.getMode()).toBe('indeterminate');
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBeNull();
    expect(
      element.querySelector('[role="progressbar"]')?.getAttribute('aria-valuetext'),
    ).toBeNull();
    expect(element.textContent).not.toContain('%');
  });
  it.each([-1, 101, Number.NaN, Infinity])(
    'diagnoses invalid determinate progress %s and recovers with valid data',
    async (value) => {
      const fixture = TestBed.createComponent(HavenProgress);
      fixture.componentRef.setInput('value', value);
      await fixture.whenStable();
      const element = fixture.nativeElement as HTMLElement;
      expect(element.querySelector('[role="alert"]')).not.toBeNull();
      expect(element.querySelector('mat-progress-bar')).toBeNull();
      fixture.componentRef.setInput('value', 40);
      await fixture.whenStable();
      expect(element.querySelector('[role="alert"]')).toBeNull();
      expect(element.querySelector('mat-progress-bar')).not.toBeNull();
    },
  );
  it('emits an alert dismissal request without hiding host-owned content and honors disabled/readonly', async () => {
    const fixture = TestBed.createComponent(HavenAlert);
    fixture.componentRef.setInput('title', title);
    fixture.componentRef.setInput('message', 'Review changes');
    fixture.componentRef.setInput('dismissible', true);
    let requests = 0;
    fixture.componentInstance.dismissed.subscribe(() => requests++);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const button = element.querySelector<HTMLButtonElement>('button')!;
    button.click();
    await fixture.whenStable();
    expect(requests).toBe(1);
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Review changes');
    for (const flag of ['disabled', 'readonly']) {
      fixture.componentRef.setInput(flag, true);
      await fixture.whenStable();
      expect(button.disabled).toBe(true);
      button.click();
      fixture.componentInstance.dismiss();
      expect(requests).toBe(1);
      fixture.componentRef.setInput(flag, false);
    }
    fixture.componentRef.setInput('announce', false);
    fixture.componentRef.setInput('dismissible', false);
    await fixture.whenStable();
    expect(element.querySelector('[role="alert"]')).toBeNull();
    expect(element.querySelector('button')).toBeNull();
  });
  it('delegates horizontal/vertical/inset separator semantics to Material', async () => {
    const fixture = TestBed.createComponent(HavenDivider);
    await fixture.whenStable();
    const divider = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatDividerHarness);
    expect(await divider.getOrientation()).toBe('horizontal');
    fixture.componentRef.setInput('vertical', true);
    fixture.componentRef.setInput('inset', true);
    fixture.componentRef.setInput('label', title);
    await fixture.whenStable();
    expect(await divider.getOrientation()).toBe('vertical');
    expect(await divider.isInset()).toBe(true);
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('[role="separator"]')
        ?.getAttribute('aria-orientation'),
    ).toBe('vertical');
  });
});
