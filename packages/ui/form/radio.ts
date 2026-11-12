import { HavenGlassSurface } from '@haven/ui/glass';
import { ChangeDetectionStrategy, Component, input, model, viewChildren } from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';
import { MatRadioButton, MatRadioModule } from '@angular/material/radio';
import type { ChoiceOption, ChoiceValue } from '@haven/schema';
import { HavenFieldPresentation } from './fields';

@Component({
  selector: 'haven-radio-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HavenGlassSurface, MatRadioModule],
  template: `<haven-glass-surface
    ><fieldset [disabled]="disabled() || readonly()">
      <legend>
        {{ label() }}
        @if (required()) {
          <span aria-hidden="true">*</span>
        }
      </legend>
      <mat-radio-group
        [value]="value()"
        (change)="select($event.value)"
        (focusout)="touch.emit()"
        [disabled]="disabled() || readonly()"
        [required]="required()"
        [attr.aria-label]="label()"
        [attr.aria-invalid]="invalid() && touched()"
      >
        @for (option of options(); track option.value) {
          <mat-radio-button [value]="option.value" [disabled]="option.disabled ?? false">{{
            localization.text(option.label)
          }}</mat-radio-button>
        }
      </mat-radio-group>
      @if (description()) {
        <p>{{ description() }}</p>
      }
      @if (invalid() && touched()) {
        @for (error of errors(); track $index) {
          <p class="error" role="status">{{ localization.error(error) }}</p>
        }
      }
    </fieldset></haven-glass-surface
  >`,
  styles: `
    :host {
      display: block;
    }
    fieldset {
      border: 0;
      margin: 0;
      padding: 0;
      min-width: 0;
    }
    mat-radio-group {
      display: flex;
      flex-wrap: wrap;
      gap: var(--haven-gap-sm);
    }
    p {
      margin-block: var(--haven-gap-xs);
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class HavenRadioField
  extends HavenFieldPresentation
  implements FormValueControl<ChoiceValue | null>
{
  readonly value = model<ChoiceValue | null>(null);
  readonly options = input<readonly ChoiceOption[]>([]);
  readonly controls = viewChildren(MatRadioButton);
  select(value: unknown): void {
    if (
      !this.disabled() &&
      !this.readonly() &&
      this.options().some((option) => option.value === value && !option.disabled)
    ) {
      this.value.set(value as ChoiceValue);
      this.touch.emit();
    }
  }
  focus(options?: FocusOptions): void {
    const buttons = this.controls();
    (
      buttons.find((button) => button.value === this.value() && !button.disabled) ??
      buttons.find((button) => !button.disabled)
    )?.focus(options);
  }
}
