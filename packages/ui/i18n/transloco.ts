import { Injectable, inject } from '@angular/core';
import type { Provider } from '@angular/core';
import type { ValidationError } from '@angular/forms/signals';
import { TranslocoService, TRANSLOCO_FALLBACK_STRATEGY } from '@jsverse/transloco';
import { HavenLocalization } from '@haven/ui';
import { localizeText } from '@haven/schema/localization';
import type { Diagnostic } from '@haven/schema';

@Injectable()
class TranslocoHavenLocalization extends HavenLocalization {
  readonly #transloco = inject(TranslocoService);
  readonly #fallback = inject(TRANSLOCO_FALLBACK_STRATEGY);
  readonly locale = this.#transloco.activeLang;
  text(value: unknown): string {
    // Map document-owned captions using the framework's language policy; never register
    // user documents in a global translation store, where concurrent previews could collide.
    return localizeText(value, this.locale(), this.#fallback.getNextLangs(this.locale()));
  }
  message(key: string, params?: Record<string, unknown>): string {
    return this.#transloco.translate<string>(`haven.${key}`, params, this.locale());
  }
  diagnostic(error: Diagnostic): string {
    return this.translate(
      `diagnostic.${error.code}`,
      error.code.startsWith('structure.') ? 'diagnostic.structure' : 'diagnostic.invalid',
    );
  }
  error(error: ValidationError.WithOptionalFieldTree): string {
    if (error.kind === 'validationRule' && 'caption' in error) return this.text(error.caption);
    return error.message ?? this.translate(`validation.${error.kind}`, 'validation.invalid');
  }
  private translate(key: string, fallback: string): string {
    const languages = [this.locale(), ...this.#fallback.getNextLangs(this.locale())];
    const exists = languages.some((language) =>
      Object.hasOwn(this.#transloco.getTranslation(language), `haven.${key}`),
    );
    return this.#transloco.translate<string>(`haven.${exists ? key : fallback}`, {}, this.locale());
  }
}
/** Configure Transloco normally and load Haven locale resources under the `haven` namespace. */
export function provideHavenTransloco(): Provider {
  return { provide: HavenLocalization, useClass: TranslocoHavenLocalization };
}
