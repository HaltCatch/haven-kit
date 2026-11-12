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
import type { ChoiceOption, ChoiceValue } from '@haven/schema';
import { HavenFieldPresentation } from './fields';

@Component({
  selector: 'haven-select-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HavenGlassSurface, MatFormFieldModule, MatSelectModule],
  template: `<haven-glass-surface
    ><mat-form-field [appearance]="appearance()">
      <mat-label>{{ label() }}</mat-label>
      <mat-select
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
        @if (!required()) {
          <mat-option [value]="emptyValue()">{{ localization.message('choice.clear') }}</mat-option>
        }
        @if (unknownValue()) {
          <mat-option [value]="value()" disabled>{{ value() }}</mat-option>
        }
        @for (option of options(); track option.value) {
          <mat-option [value]="option.value" [disabled]="option.disabled ?? false">{{
            localization.text(option.label)
          }}</mat-option>
        }
      </mat-select>
      @if (description()) {
        <mat-hint>{{ description() }}</mat-hint>
      }
      @for (error of errors(); track $index) {
        <mat-error>{{ localization.error(error) }}</mat-error>
      }
    </mat-form-field></haven-glass-surface
  >`,
  styles: ':host, mat-form-field { display: block; width: 100%; min-width: 0; }',
})
export class HavenSelectField
  extends HavenFieldPresentation
  implements FormValueControl<ChoiceValue | null>
{
  readonly opened = signal(false);
  readonly #theme = inject(HAVEN_THEME_CONTEXT, { optional: true });
  readonly value = model<ChoiceValue | null>(null);
  readonly emptyValue = input<'' | null>(null);
  readonly options = input<readonly ChoiceOption[]>([]);
  readonly placeholder = input('');
  readonly control = viewChild(MatSelect);
  readonly unknownValue = computed(
    () =>
      this.value() !== null &&
      this.value() !== '' &&
      !this.options().some((option) => option.value === this.value()),
  );
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
    if (this.disabled() || this.readonly()) return;
    if (value === null || value === undefined || value === '') this.value.set(this.emptyValue());
    else if (this.options().some((option) => option.value === value && !option.disabled))
      this.value.set(value as ChoiceValue);
  }
  focus(options?: FocusOptions): void {
    this.control()?.focus(options);
  }
}
