import type { Signal } from '@angular/core';
import type { ValidationError } from '@angular/forms/signals';
import type { Diagnostic } from '@haven/schema';

/** Public UI boundary. Supply the standard Transloco adapter or your application's adapter. */
export abstract class HavenLocalization {
  abstract readonly locale: Signal<string>;
  abstract text(value: unknown): string;
  abstract message(key: string, params?: Record<string, unknown>): string;
  abstract diagnostic(error: Diagnostic): string;
  abstract error(error: ValidationError.WithOptionalFieldTree): string;
  number(value: number, options?: Intl.NumberFormatOptions): string {
    return new Intl.NumberFormat(this.locale(), options).format(value);
  }
  date(value: Date | number, options?: Intl.DateTimeFormatOptions): string {
    return new Intl.DateTimeFormat(this.locale(), options).format(value);
  }
}
