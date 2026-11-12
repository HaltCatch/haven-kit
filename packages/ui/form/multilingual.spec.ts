import { TestBed } from '@angular/core/testing';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { provideHavenTransloco } from '@haven/ui/i18n';
import { isMultilingualLocales, isMultilingualValue } from '@haven/schema';
import { HavenMultilingualField } from './multilingual';
import { beforeEach, afterEach, expect, it } from 'vitest';

beforeEach(() =>
  TestBed.configureTestingModule({
    providers: [
      provideTransloco({
        config: { defaultLang: 'en-US', availableLangs: ['en-US', 'zh-CN'], prodMode: true },
      }),
      provideHavenTransloco(),
    ],
  }),
);
afterEach(() => TestBed.resetTestingModule());
function create() {
  const fixture = TestBed.createComponent(HavenMultilingualField);
  fixture.componentRef.setInput('label', 'Content');
  fixture.componentRef.setInput('locales', ['en-US', 'zh-CN']);
  return fixture;
}
it('edits locale values without encoding, mutating callers or dropping hidden locales', async () => {
  const fixture = create();
  const original = { 'en-US': 'First', 'zh-CN': '原文', 'fr-FR': 'Conservé' };
  fixture.componentRef.setInput('value', original);
  await fixture.whenStable();
  const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
    'input[lang="en-US"]',
  )!;
  input.value = 'a;b；c';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await fixture.whenStable();
  expect(fixture.componentInstance.value()).toEqual({ ...original, 'en-US': 'a;b；c' });
  expect(original['en-US']).toBe('First');
  TestBed.inject(TranslocoService).setActiveLang('zh-CN');
  fixture.componentRef.setInput('locales', ['zh-CN', 'en-US']);
  await fixture.whenStable();
  expect(fixture.componentInstance.value()['en-US']).toBe('a;b；c');
  expect(fixture.componentInstance.value()['fr-FR']).toBe('Conservé');
});
it('respects readonly, disabled, maximum length and invalid locale configuration', async () => {
  const fixture = create();
  fixture.componentRef.setInput('value', { 'en-US': 'Saved' });
  fixture.componentRef.setInput('readonly', true);
  await fixture.whenStable();
  fixture.componentInstance.edit('en-US', 'No');
  expect(fixture.componentInstance.value()).toEqual({ 'en-US': 'Saved' });
  expect((fixture.nativeElement as HTMLElement).querySelector('input')!.readOnly).toBe(true);
  fixture.componentRef.setInput('readonly', false);
  fixture.componentRef.setInput('disabled', true);
  await fixture.whenStable();
  fixture.componentInstance.edit('en-US', 'No');
  expect(fixture.componentInstance.value()['en-US']).toBe('Saved');
  fixture.componentRef.setInput('disabled', false);
  fixture.componentRef.setInput('textMaxLength', 2);
  await fixture.whenStable();
  fixture.componentInstance.edit('en-US', 'Long');
  expect(fixture.componentInstance.value()['en-US']).toBe('Saved');
  fixture.componentRef.setInput('locales', ['en-US', 'en-us']);
  await fixture.whenStable();
  expect(fixture.componentInstance.validConfiguration()).toBe(false);
  expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).not.toBeNull();
});
it('validates language dictionaries independently of UI language resources', () => {
  expect(isMultilingualValue({ 'en-US': '', 'zh-CN': ';；' })).toBe(true);
  expect(isMultilingualValue({ 'en-US': 7 })).toBe(false);
  expect(isMultilingualValue(JSON.parse('{"__proto__":"no"}'))).toBe(false);
  expect(isMultilingualLocales(['en-US', 'en-us'])).toBe(false);
  expect(isMultilingualLocales([])).toBe(false);
});
