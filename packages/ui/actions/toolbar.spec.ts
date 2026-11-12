import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { provideHavenTransloco } from '@haven/ui/i18n';
import english from '@haven/ui/i18n/locales/en-US.json';
import chinese from '@haven/ui/i18n/locales/zh-CN.json';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { HavenToolbar } from './toolbar';
import type { HavenToolbarOrientation } from './toolbar';
@Component({
  imports: [HavenToolbar],
  template: `<haven-toolbar
    [label]="label"
    [orientation]="orientation()"
    [wrap]="wrap()"
    align="space-between"
    gap="lg"
  >
    <button type="button" (click)="calls.update(increment)">Run</button
    ><button type="button" disabled>Unavailable</button>
    <input aria-label="Search" />
  </haven-toolbar>`,
})
class Host {
  readonly label = { default: 'Page actions', translations: { 'zh-CN': '页面操作' } };
  readonly orientation = signal<HavenToolbarOrientation>('horizontal');
  readonly wrap = signal(true);
  readonly calls = signal(0);
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
  const locale = TestBed.inject(TranslocoService);
  locale.setTranslation({ haven: english }, 'en-US');
  locale.setTranslation({ haven: chinese }, 'zh-CN');
});
afterEach(() => TestBed.resetTestingModule());
it('projects actual host controls without replacing their native click/disabled/focus semantics', async () => {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement,
    buttons = element.querySelectorAll('button');
  buttons[0]!.click();
  buttons[1]!.click();
  expect(fixture.componentInstance.calls()).toBe(1);
  expect(buttons[0]!.tabIndex).toBe(0);
  expect(buttons[1]!.disabled).toBe(true);
  const input = element.querySelector('input')!;
  input.focus();
  expect(document.activeElement).toBe(input);
  expect(element.querySelector('[role="toolbar"]')?.getAttribute('aria-label')).toBe(
    'Page actions',
  );
  TestBed.inject(TranslocoService).setActiveLang('zh-CN');
  await fixture.whenStable();
  expect(element.querySelector('[role="toolbar"]')?.getAttribute('aria-label')).toBe('页面操作');
});
it('exposes orientation and applies wrap/alignment/theme gap without changing projected controls', async () => {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const toolbar = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
    '[role="toolbar"]',
  )!;
  expect(toolbar.getAttribute('aria-orientation')).toBe('horizontal');
  expect(toolbar.style.flexWrap).toBe('wrap');
  expect(toolbar.style.gap).toBe('var(--haven-gap-lg)');
  const button = toolbar.querySelector('button');
  fixture.componentInstance.orientation.set('vertical');
  fixture.componentInstance.wrap.set(false);
  await fixture.whenStable();
  expect(toolbar.getAttribute('aria-orientation')).toBe('vertical');
  expect(toolbar.style.flexDirection).toBe('column');
  expect(toolbar.style.flexWrap).toBe('nowrap');
  expect(toolbar.style.justifyContent).toBe('space-between');
  expect(toolbar.querySelector('button')).toBe(button);
});
