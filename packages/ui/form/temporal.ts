import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  output,
  signal,
  input,
  model,
  viewChild,
} from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';
import type { ErrorStateMatcher } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { HavenGlassSurface } from '@haven/ui/glass';
import { HavenFieldPresentation } from './fields';

/** Native localized editing, canonical local strings. No Date, epoch or implicit timezone conversion. */
@Component({
  selector: 'haven-temporal-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HavenGlassSurface, MatFormFieldModule, MatInputModule],
  templateUrl: './temporal.html',
  styles: ':host, mat-form-field { display: block; width: 100%; min-width: 0; }',
})
export class HavenTemporalField
  extends HavenFieldPresentation
  implements FormValueControl<string | null>
{
  readonly value = model<string | null>(null);
  /** Transient native parse state; the host must include this in its form validation. */
  readonly parseError = output<boolean>();
  readonly parseInvalid = signal(false);
  readonly temporalErrorMatcher: ErrorStateMatcher = {
    isErrorState: () => (this.invalid() || this.parseInvalid()) && this.touched(),
  };
  readonly presentedErrors = computed(() =>
    this.parseInvalid() && !this.errors().some((error) => error.kind === 'temporalFormat')
      ? [...this.errors(), { kind: 'temporalFormat' }]
      : this.errors(),
  );
  readonly kind = input<'date' | 'time' | 'datetime'>('date');
  readonly minimum = input<string>();
  readonly maximum = input<string>();
  readonly control = viewChild<ElementRef<HTMLInputElement>>('control');
  readonly nativeType = computed(() =>
    this.kind() === 'datetime' ? 'datetime-local' : this.kind(),
  );
  constructor() {
    super();
    effect(() => {
      this.value();
      this.kind();
      this.setParseError(false);
    });
    effect(() => {
      this.parseInvalid();
      this.materialInput()?.updateErrorState();
    });
  }
  private setParseError(invalid: boolean): void {
    this.parseInvalid.set(invalid);
    this.parseError.emit(invalid);
  }
  reset(): void {
    this.setParseError(false);
    const control = this.control()?.nativeElement;
    if (control) control.value = this.value() ?? '';
  }
  onInput(control: HTMLInputElement): void {
    if (this.disabled() || this.readonly()) return;
    this.setParseError(control.validity.badInput);
    // An incomplete native edit must not overwrite the last canonical value or masquerade as clear.
    if (!control.validity.badInput) this.value.set(control.value || null);
  }
  focus(options?: FocusOptions): void {
    this.control()?.nativeElement.focus(options);
  }
}
