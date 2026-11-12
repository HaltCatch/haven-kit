import { TestBed } from '@angular/core/testing';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { provideHavenTransloco } from '@haven/ui/i18n';
import english from '@haven/ui/i18n/locales/en-US.json';
import chinese from '@haven/ui/i18n/locales/zh-CN.json';
import type { AsyncValidation, HavenDocument, JsonObject } from '@haven/schema';
import type { ValidationAdapter, ValidationRequest } from '@haven/runtime';
import { HavenRenderer } from '../../packages/ui/renderer/renderer';
export function setupValidationTests() {
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
}
export const asyncRule: AsyncValidation = {
  id: 'check',
  type: 'async',
  resource: 'check',
  message: { default: 'Rejected value', translations: { 'zh-CN': '此值未通过' } },
  debounceMs: 5,
};
export function validationDocument(): HavenDocument {
  return {
    schemaVersion: '1.0',
    id: 'validation',
    title: 'Validation',
    dataSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        other: { type: 'string' },
        secret: { type: 'string' },
        enabled: { type: 'boolean' },
      },
    },
    ui: {
      id: 'root',
      kind: 'form',
      version: 1,
      children: [
        {
          id: 'name',
          kind: 'field.text',
          version: 1,
          bind: '/name',
          props: { label: 'Name' },
          validators: [asyncRule],
        },
        { id: 'other', kind: 'field.text', version: 1, bind: '/other', props: { label: 'Other' } },
      ],
    },
    theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
    resources: { check: { type: 'validation', adapter: 'test.check' } },
    actions: {},
  };
}
export function pendingValidation() {
  const calls: {
    request: ValidationRequest;
    resolve: (result: { valid: boolean }) => void;
    reject: (error: Error) => void;
  }[] = [];
  const adapter: ValidationAdapter = {
    validate: (request) =>
      new Promise((resolve, reject) => calls.push({ request, resolve, reject })),
  };
  return { calls, adapter };
}
export function createValidation(
  doc = validationDocument(),
  value: JsonObject = {
    name: 'First',
    other: 'Dependency',
    secret: 'Unrelated private value',
    enabled: true,
  },
  adapter?: ValidationAdapter,
) {
  const fixture = TestBed.createComponent(HavenRenderer);
  fixture.componentRef.setInput('document', doc);
  fixture.componentRef.setInput('value', value);
  if (adapter)
    fixture.componentRef.setInput('host', { validators: new Map([['test.check', adapter]]) });
  fixture.detectChanges();
  TestBed.tick();
  return fixture;
}
