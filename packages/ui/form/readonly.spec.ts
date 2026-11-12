import { TestBed } from '@angular/core/testing';
import { provideTransloco } from '@jsverse/transloco';
import { provideHavenTransloco } from '@haven/ui/i18n';
import { HavenTextField, HavenNumberField } from './fields';
import type { HavenFieldPresentation } from './fields';
import { HavenTemporalField } from './temporal';
import { HavenRemoteSelectField, HavenRemoteMultiselectField } from './remote-select';
import { beforeEach, afterEach, expect, it } from 'vitest';

beforeEach(() =>
  TestBed.configureTestingModule({
    providers: [
      provideTransloco({
        config: { defaultLang: 'en-US', availableLangs: ['en-US'], prodMode: true },
      }),
      provideHavenTransloco(),
    ],
  }),
);
afterEach(() => TestBed.resetTestingModule());

it.each([
  ['text', HavenTextField],
  ['password', HavenTextField],
  ['textarea', HavenTextField],
  ['number', HavenNumberField],
  ['date', HavenTemporalField],
  ['time', HavenTemporalField],
  ['datetime', HavenTemporalField],
  ['remote', HavenRemoteSelectField],
  ['remote-multiple', HavenRemoteMultiselectField],
] as const)(
  'preserves initially readonly %s through Material initialization and subsequent toggles',
  async (name, component) => {
    const fixture = TestBed.createComponent<HavenFieldPresentation>(component);
    fixture.componentRef.setInput('label', 'Readonly input');
    fixture.componentRef.setInput('readonly', true);
    if (name === 'password') fixture.componentRef.setInput('type', 'password');
    if (name === 'textarea') fixture.componentRef.setInput('multiline', true);
    if (['date', 'time', 'datetime'].includes(name)) fixture.componentRef.setInput('kind', name);
    if (name.startsWith('remote'))
      fixture.componentRef.setInput('adapter', {
        search: async () => ({ items: [] }),
        resolve: async () => [],
      });
    await fixture.whenStable();
    const input = (fixture.nativeElement as HTMLElement).querySelector<
      HTMLInputElement | HTMLTextAreaElement
    >('input, textarea')!;
    expect(input.readOnly).toBe(true);
    expect(input.disabled).toBe(false);
    input.focus();
    await fixture.whenStable();
    expect(document.activeElement).toBe(input);
    expect(input.readOnly).toBe(true);
    fixture.componentRef.setInput('readonly', false);
    await fixture.whenStable();
    expect(input.readOnly).toBe(false);
    fixture.componentRef.setInput('readonly', true);
    await fixture.whenStable();
    expect(input.readOnly).toBe(true);
  },
);
