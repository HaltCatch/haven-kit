import { HavenGlassSurface } from '@haven/ui/glass';
import { HAVEN_THEME_CONTEXT, applyHavenTheme } from '@haven/ui/theme';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  inject,
  signal,
  model,
  viewChild,
} from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';
import { MatSelect, MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import type { ChoiceOption, ChoiceValue } from '@haven/schema';
import { HavenFieldPresentation } from './fields';

/** Primitive arrays only; option labels and transient selection UI never enter form data. */
@Component({
  selector: 'haven-multiselect-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HavenGlassSurface, MatFormFieldModule, MatSelectModule, MatButtonModule],
  template: `<haven-glass-surface>
    <mat-form-field [appearance]="appearance()">
      <mat-label>{{ label() }}</mat-label>
      <mat-select
        multiple
        [value]="value()"
        (selectionChange)="select($event.value)"
        [disabled]="disabled() || readonly()"
        [required]="required()"
        [placeholder]="placeholder()"
        [errorStateMatcher]="errorMatcher"
        (openedChange)="opened.set($event)"
        (closed)="touch.emit()"
        (blur)="touch.emit()"
      >
        @for (value of unknownValues(); track value) {
          <mat-option [value]="value" disabled>{{ value }}</mat-option>
        }
        @for (option of options(); track option.value) {
          <mat-option [value]="option.value" [disabled]="option.disabled ?? false">{{
            localization.text(option.label)
          }}</mat-option>
        }
      </mat-select>
      @if (value().length > 0) {
        <button
          matIconButton
          matIconSuffix
          type="button"
          [disabled]="disabled() || readonly()"
          [attr.aria-label]="localization.message('choice.clear') + ': ' + label()"
          (click)="clear($event)"
        >
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
            <path d="M6 6 18 18M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" />
          </svg>
        </button>
      }
      @if (description()) {
        <mat-hint>{{ description() }}</mat-hint>
      }
      @for (error of errors(); track $index) {
        <mat-error>{{ localization.error(error) }}</mat-error>
      }
    </mat-form-field>
  </haven-glass-surface>`,
  styles: ':host, mat-form-field { display: block; width: 100%; min-width: 0; }',
})
export class HavenMultiselectField
  extends HavenFieldPresentation
  implements FormValueControl<ChoiceValue[]>
{
  readonly opened = signal(false);
  readonly #theme = inject(HAVEN_THEME_CONTEXT, { optional: true });
  readonly value = model<ChoiceValue[]>([]);
  readonly options = input<readonly ChoiceOption[]>([]);
  readonly placeholder = input('');
  readonly control = viewChild(MatSelect);
  readonly #optionsByValue = computed(
    () => new Map(this.options().map((option) => [option.value, option])),
  );
  readonly unknownValues = computed(() => {
    const known = this.#optionsByValue();
    return [...new Set(this.value().filter((value) => !known.has(value)))];
  });
  protected override focusOverlay(): HTMLElement | undefined {
    return this.opened() ? this.control()?.panel?.nativeElement : undefined;
  }
  constructor() {
    super();
    effect((onCleanup) => {
      const theme = this.#theme?.();
      if (!theme || !this.opened()) return;
      const panel = this.control()?.panel?.nativeElement as HTMLElement | undefined;
      if (panel) onCleanup(applyHavenTheme(panel, theme));
    });
    effect(() => {
      this.invalid();
      this.touched();
      this.control()?.updateErrorState();
    });
  }
  select(value: unknown): void {
    if (this.disabled() || this.readonly() || !Array.isArray(value)) return;
    const options = this.#optionsByValue();
    const selected = new Set<ChoiceValue>();
    for (const candidate of value) {
      if (typeof candidate !== 'string' && typeof candidate !== 'number') return;
      const option = options.get(candidate);
      if (option && !option.disabled) selected.add(candidate);
    }
    // A change to another option must not silently remove stale or locked existing values.
    // Retained values keep their order; newly selected values follow Material's option order.
    const next = new Set(
      this.value().filter((current) => {
        const option = options.get(current);
        return !option || option.disabled || selected.has(current);
      }),
    );
    for (const candidate of selected) next.add(candidate);
    this.value.set([...next]);
  }
  clear(event: Event): void {
    event.stopPropagation();
    if (this.disabled() || this.readonly()) return;
    this.value.set([]);
    this.touch.emit();
    this.control()?.focus();
  }
  focus(options?: FocusOptions): void {
    this.control()?.focus(options);
  }
}
