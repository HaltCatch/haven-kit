import { TestBed } from '@angular/core/testing';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { fieldAt } from '@haven/ui/form-state';
import { provideHavenTransloco } from '@haven/ui/i18n';
import english from '@haven/ui/i18n/locales/en-US.json';
import type { HavenDocument } from '@haven/schema';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { HavenRenderer } from './renderer';

beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [
      provideTransloco({
        config: { defaultLang: 'en-US', availableLangs: ['en-US'], prodMode: true },
      }),
      provideHavenTransloco(),
    ],
  });
  TestBed.inject(TranslocoService).setTranslation({ haven: english }, 'en-US');
});
afterEach(() => TestBed.resetTestingModule());

const document = (): HavenDocument => ({
  schemaVersion: '1.0',
  id: 'feedback-owner',
  title: 'Transient feedback',
  dataSchema: { type: 'object', properties: { date: { type: 'string' } } },
  ui: { id: 'date', kind: 'field.date', version: 1, bind: '/date', props: { label: 'Date' } },
  theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
  actions: {},
  resources: {},
});

it('does not transfer a temporal parse error to the next revision before old controls are destroyed', async () => {
  const f = TestBed.createComponent(HavenRenderer);
  f.componentRef.setInput('document', document());
  f.componentRef.setInput('host', { revision: 'one' });
  f.componentRef.setInput('value', { date: '2026-11-08' });
  await f.whenStable();
  const r = f.componentInstance,
    oldFields = r.fields();
  r.setParseError('date', true);
  expect(r.policy('/date').parseInvalid).toBe(true);
  f.componentRef.setInput('host', { revision: 'two' });
  // This read intentionally precedes the component/form lifecycle effects.
  expect(r.policy('/date').parseInvalid).toBe(false);
  let saves = 0;
  expect(
    await r.submit({
      action: async () => {
        saves++;
      },
    }),
  ).toBe(false);
  expect(saves).toBe(0);
  await f.whenStable();
  expect(r.fields()).not.toBe(oldFields);
  expect(fieldAt(r.fields()!, '/date')!().valid()).toBe(true);
});

it('preserves native fields, dirty and touched through cosmetic model updates', async () => {
  const f = TestBed.createComponent(HavenRenderer),
    doc = document();
  f.componentRef.setInput('document', doc);
  f.componentRef.setInput('value', { date: '2026-11-08' });
  await f.whenStable();
  const r = f.componentInstance,
    fields = r.fields()!,
    date = fieldAt(fields, '/date')!();
  date.markAsTouched();
  date.markAsDirty();
  const changed = structuredClone(doc);
  changed.ui.props!['label'] = 'Renamed date';
  changed.theme.preset = 'liquid-glass';
  f.componentRef.setInput('document', changed);
  await f.whenStable();
  expect(r.fields()).toBe(fields);
  expect(date.touched()).toBe(true);
  expect(date.dirty()).toBe(true);
  expect(r.value()['date']).toBe('2026-11-08');
});
