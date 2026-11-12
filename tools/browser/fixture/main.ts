import { inject, provideAppInitializer, provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { provideHavenTransloco } from '@haven/ui/i18n';
import english from '@haven/ui/i18n/locales/en-US.json';
import chinese from '@haven/ui/i18n/locales/zh-CN.json';
import { HavenBrowserFixture } from './fixture';

// Test-only native Angular application. No production routes, credentials or business adapters.
void bootstrapApplication(HavenBrowserFixture, {
  providers: [
    provideZonelessChangeDetection(),
    provideTransloco({
      config: {
        availableLangs: ['en-US', 'zh-CN'],
        defaultLang: 'en-US',
        fallbackLang: 'en-US',
        reRenderOnLangChange: true,
        prodMode: true,
      },
    }),
    provideHavenTransloco(),
    provideAppInitializer(() => {
      const translations = inject(TranslocoService);
      translations.setTranslation({ haven: english }, 'en-US');
      translations.setTranslation({ haven: chinese }, 'zh-CN');
    }),
  ],
});
