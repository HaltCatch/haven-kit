import { FocusMonitor } from '@angular/cdk/a11y';
import { HavenGlassSurface } from '@haven/ui/glass';
import { HavenLocalization } from '@haven/ui';
import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  DestroyRef,
  ElementRef,
  effect,
  input,
  inject,
  model,
  output,
  viewChild,
} from '@angular/core';
import type {
  FormCheckboxControl,
  FormValueControl,
  ValidationError,
} from '@angular/forms/signals';
import type { MatFormFieldAppearance } from '@angular/material/form-field';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput, MatInputModule } from '@angular/material/input';
import { MatCheckbox, MatCheckboxModule } from '@angular/material/checkbox';
import type { ErrorStateMatcher } from '@angular/material/core';

/** Shared presentation state only; no data fetching or domain-level edit permissions. */
@Directive({ host: { '[attr.aria-busy]': 'pending() ? "true" : null' } })
export abstract class HavenFieldPresentation {
  readonly localization = inject(HavenLocalization);
  readonly label = input.required<string>();
  readonly appearance = input<MatFormFieldAppearance>('outline');
  readonly description = input('');
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly required = input(false);
  readonly invalid = input(false);
  readonly pending = input(false);
  readonly touched = input(false);
  readonly errors = input<readonly ValidationError.WithOptionalFieldTree[]>([]);
  readonly touch = output<void>();
  /** Leaving this composite control, including its Material overlay; not a touched notification. */
  readonly focusLeft = output<void>();
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly #focusMonitor = inject(FocusMonitor);
  readonly #destroy = inject(DestroyRef);
  #focusWithin = false;
  #focusCheckQueued = false;
  protected focusOverlay(): HTMLElement | undefined {
    return undefined;
  }
  #checkFocusLeave(): void {
    if (this.#focusCheckQueued || this.#destroy.destroyed) return;
    this.#focusCheckQueued = true;
    // Material moves focus between its trigger and overlay synchronously. Settle that
    // transfer before deciding whether the complete field has actually lost focus.
    queueMicrotask(() => {
      this.#focusCheckQueued = false;
      if (this.#destroy.destroyed || !this.#focusWithin) return;
      const host = this.#element.nativeElement;
      const active = host.ownerDocument.activeElement;
      if (host.contains(active) || this.focusOverlay()?.contains(active)) return;
      this.#focusWithin = false;
      this.focusLeft.emit();
    });
  }
  #monitor(element: HTMLElement): () => void {
    const subscription = this.#focusMonitor.monitor(element, true).subscribe((origin) => {
      if (origin) this.#focusWithin = true;
      else this.#checkFocusLeave();
    });
    return () => {
      subscription.unsubscribe();
      this.#focusMonitor.stopMonitoring(element);
    };
  }
  readonly materialInput = viewChild(MatInput);
  constructor() {
    this.#destroy.onDestroy(this.#monitor(this.#element.nativeElement));
    effect((cleanup) => {
      const panel = this.focusOverlay();
      if (panel) cleanup(this.#monitor(panel));
      // Removing a focused panel need not dispatch a native blur event.
      this.#checkFocusLeave();
    });
    // The inner MatInput has no NgControl: the outer component owns the Signal Forms binding.
    // Refresh through Material's public API when the host form's state changes.
    effect(() => {
      this.invalid();
      this.touched();
      this.materialInput()?.updateErrorState();
    });
  }
  readonly errorMatcher: ErrorStateMatcher = {
    isErrorState: () => this.invalid() && this.touched(),
  };
}
@Component({
  selector: 'haven-text-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HavenGlassSurface, MatFormFieldModule, MatInputModule],
  template: `<haven-glass-surface>
    <mat-form-field [appearance]="appearance()">
      <mat-label>{{ label() }}</mat-label>
      @if (multiline()) {
        <textarea
          #control
          matInput
          [value]="value()"
          (input)="value.set(control.value)"
          (blur)="touch.emit()"
          [disabled]="disabled()"
          [readonly]="readonly()"
          [required]="required()"
          [placeholder]="placeholder()"
          [attr.minlength]="minLength() ?? null"
          [attr.maxlength]="maxLength() ?? null"
          [errorStateMatcher]="errorMatcher"
        ></textarea>
      } @else {
        <input
          #control
          matInput
          [type]="type()"
          [value]="value()"
          (input)="value.set(control.value)"
          (blur)="touch.emit()"
          [disabled]="disabled()"
          [readonly]="readonly()"
          [required]="required()"
          [placeholder]="placeholder()"
          [attr.minlength]="minLength() ?? null"
          [attr.maxlength]="maxLength() ?? null"
          [errorStateMatcher]="errorMatcher"
        />
      }
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
export class HavenTextField extends HavenFieldPresentation implements FormValueControl<string> {
  readonly value = model('');
  readonly type = input<'text' | 'password' | 'email'>('text');
  readonly multiline = input(false);
  readonly placeholder = input('');
  readonly minLength = input<number>();
  readonly maxLength = input<number>();
  readonly control = viewChild<ElementRef<HTMLInputElement | HTMLTextAreaElement>>('control');
  focus(options?: FocusOptions): void {
    this.control()?.nativeElement.focus(options);
  }
}
@Component({
  selector: 'haven-number-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HavenGlassSurface, MatFormFieldModule, MatInputModule],
  template: `<haven-glass-surface
    ><mat-form-field [appearance]="appearance()">
      <mat-label>{{ label() }}</mat-label>
      <input
        #control
        matInput
        type="number"
        [value]="value() ?? ''"
        (input)="onInput(control)"
        (blur)="touch.emit()"
        [disabled]="disabled()"
        [readonly]="readonly()"
        [required]="required()"
        [min]="min() ?? null"
        [max]="max() ?? null"
        [step]="step()"
        [errorStateMatcher]="errorMatcher"
      />
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
export class HavenNumberField
  extends HavenFieldPresentation
  implements FormValueControl<number | null>
{
  readonly value = model<number | null>(null);
  readonly min = input<number>();
  readonly max = input<number>();
  readonly step = input<number | 'any'>('any');
  readonly control = viewChild<ElementRef<HTMLInputElement>>('control');
  onInput(control: HTMLInputElement): void {
    this.value.set(Number.isFinite(control.valueAsNumber) ? control.valueAsNumber : null);
  }
  focus(options?: FocusOptions): void {
    this.control()?.nativeElement.focus(options);
  }
}
@Component({
  selector: 'haven-checkbox-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HavenGlassSurface, MatCheckboxModule],
  template: `<haven-glass-surface
    ><mat-checkbox
      #control
      [checked]="checked()"
      (change)="checked.set($event.checked)"
      (focusout)="touch.emit()"
      [disabled]="disabled() || readonly()"
      [required]="required()"
      [aria-describedby]="control.id + '-description'"
      >{{ label() }}</mat-checkbox
    >
    <div [id]="control.id + '-description'">
      @if (description()) {
        <span>{{ description() }}</span>
      }
      @if (invalid() && touched()) {
        @for (error of errors(); track $index) {
          <p role="status">{{ localization.error(error) }}</p>
        }
      }
    </div></haven-glass-surface
  >`,
  styles: ':host { display: block; } p { color: var(--mat-sys-error); }',
})
export class HavenCheckboxField extends HavenFieldPresentation implements FormCheckboxControl {
  readonly checked = model(false);
  readonly control = viewChild(MatCheckbox);
  focus(): void {
    this.control()?.focus();
  }
}
