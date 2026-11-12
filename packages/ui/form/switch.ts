import { HavenGlassSurface } from '@haven/ui/glass';
import { ChangeDetectionStrategy, Component, model, viewChild } from '@angular/core';
import type { FormCheckboxControl } from '@angular/forms/signals';
import { MatSlideToggle, MatSlideToggleModule } from '@angular/material/slide-toggle';
import { HavenFieldPresentation } from './fields';

@Component({
  selector: 'haven-switch-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HavenGlassSurface, MatSlideToggleModule],
  template: `<haven-glass-surface
    ><mat-slide-toggle
      [checked]="checked()"
      (change)="checked.set($event.checked)"
      [disabled]="disabled() || readonly()"
      [required]="required()"
      (focusout)="touch.emit()"
    >
      {{ label() }}
    </mat-slide-toggle>
    @if (description()) {
      <p>{{ description() }}</p>
    }
    @if (invalid() && touched()) {
      @for (error of errors(); track $index) {
        <p class="error" role="status">{{ localization.error(error) }}</p>
      }
    }
  </haven-glass-surface>`,
  styles:
    ':host { display: block; } p { margin-block: var(--haven-gap-xs); } .error { color: var(--mat-sys-error); }',
})
export class HavenSwitchField extends HavenFieldPresentation implements FormCheckboxControl {
  readonly checked = model(false);
  readonly control = viewChild(MatSlideToggle);
  focus(): void {
    this.control()?.focus();
  }
}
