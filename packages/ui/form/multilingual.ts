import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  model,
  viewChildren,
} from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { HavenGlassSurface } from '@haven/ui/glass';
import { isMultilingualLocales, isMultilingualValue } from '@haven/schema';
import { HavenFieldPresentation } from './fields';

/** Translation values are application data; changing UI language never rewrites them. */
@Component({
  selector: 'haven-multilingual-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HavenGlassSurface, MatFormFieldModule, MatInputModule],
  template: `<haven-glass-surface
    ><fieldset [disabled]="disabled()">
      <legend>{{ label() }}</legend>
      @if (!validConfiguration()) {
        <p role="alert">{{ localization.message('multilingual.configuration') }}</p>
      }
      @if (!validValue()) {
        <p role="alert">{{ localization.message('multilingual.value') }}</p>
      }
      @for (locale of editingLocales(); track locale) {
        <mat-form-field [appearance]="appearance()">
          <mat-label>{{ localeName(locale) }}</mat-label>
          <input
            #control
            matInput
            [attr.lang]="locale"
            [value]="displayedValue()[locale] ?? ''"
            [readonly]="readonly() || !validValue()"
            [disabled]="disabled()"
            [attr.maxlength]="textMaxLength() ?? null"
            [errorStateMatcher]="errorMatcher"
            (input)="edit(locale, control.value)"
            (blur)="touch.emit()"
          />
        </mat-form-field>
      }
      @if (description()) {
        <p>{{ description() }}</p>
      }
      @if (invalid() && touched()) {
        @for (error of errors(); track $index) {
          <p role="status">{{ localization.error(error) }}</p>
        }
      }
    </fieldset></haven-glass-surface
  >`,
  styles: `
    :host,
    mat-form-field {
      display: block;
      min-width: 0;
    }
    fieldset {
      border: 0;
      padding: max(var(--haven-gap-md), 1em) 0 0;
      margin: 0;
      min-width: 0;
    }
    legend {
      padding: 0;
      overflow-wrap: anywhere;
    }
    p {
      margin-block: var(--haven-gap-xs);
    }
  `,
})
export class HavenMultilingualField
  extends HavenFieldPresentation
  implements FormValueControl<Record<string, string>>
{
  readonly value = model<Record<string, string>>({});
  readonly locales = input<readonly string[]>([]);
  readonly validValue = computed(() => isMultilingualValue(this.value()));
  readonly displayedValue = computed(() => (this.validValue() ? this.value() : {}));
  readonly textMaxLength = input<number>();
  readonly validConfiguration = computed(
    () =>
      isMultilingualLocales(this.locales()) &&
      (this.textMaxLength() === undefined ||
        (Number.isSafeInteger(this.textMaxLength()) && this.textMaxLength()! >= 0)),
  );
  readonly editingLocales = computed(() => (this.validConfiguration() ? this.locales() : []));
  readonly controls = viewChildren<ElementRef<HTMLInputElement>>('control');
  localeName(locale: string): string {
    return (
      new Intl.DisplayNames([this.localization.locale()], { type: 'language' }).of(locale) ?? locale
    );
  }
  edit(locale: string, text: string): void {
    if (
      this.disabled() ||
      this.readonly() ||
      !this.validValue() ||
      !this.editingLocales().includes(locale)
    )
      return;
    if (this.textMaxLength() !== undefined && text.length > this.textMaxLength()!) return;
    this.value.update((current) => ({ ...current, [locale]: text }));
  }
  focus(options?: FocusOptions): void {
    this.controls()[0]?.nativeElement.focus(options);
  }
}
