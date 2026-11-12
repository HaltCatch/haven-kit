import { TestBed } from '@angular/core/testing';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { provideHavenTransloco } from '@haven/ui/i18n';
import english from '@haven/ui/i18n/locales/en-US.json';
import chinese from '@haven/ui/i18n/locales/zh-CN.json';
import { expect } from 'vitest';
import { HavenRichTextField } from '../../packages/ui/rich-text/rich-text';

export function setupRichTextTests(): void {
  TestBed.configureTestingModule({
    providers: [
      provideTransloco({
        config: { defaultLang: 'en-US', availableLangs: ['en-US', 'zh-CN'], prodMode: true },
      }),
      provideHavenTransloco(),
    ],
  });
  const l = TestBed.inject(TranslocoService);
  l.setTranslation({ haven: english }, 'en-US');
  l.setTranslation({ haven: chinese }, 'zh-CN');
  // jsdom has no layout engine. Keep the real editor, supply only missing DOM geometry APIs.
  if (!Range.prototype.getBoundingClientRect)
    Range.prototype.getBoundingClientRect = () => new DOMRect();
  if (!Range.prototype.getClientRects)
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
}
export async function createRichText(value = '', inputs: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(HavenRichTextField);
  fixture.componentRef.setInput('label', 'Description');
  fixture.componentRef.setInput('value', value);
  for (const [name, input] of Object.entries(inputs)) fixture.componentRef.setInput(name, input);
  await fixture.whenStable();
  await expect
    .poll(async () => {
      await fixture.whenStable();
      return fixture.componentInstance.ready();
    })
    .toBe(true);
  await fixture.whenStable();
  return fixture;
}
