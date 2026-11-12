import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  computed,
  contentChildren,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MatStepper, MatStepperIntl, MatStepperModule } from '@angular/material/stepper';
import { MatButtonModule } from '@angular/material/button';
import type { LocalizedText } from '@haven/schema';
import { HavenLocalization } from '@haven/ui';
import { HavenGlassSurface } from '@haven/ui/glass';
import { HavenPanel } from './tab';

function stepperIntl(): MatStepperIntl {
  const localization = inject(HavenLocalization),
    intl = new MatStepperIntl();
  effect(() => {
    intl.optionalLabel = localization.message('navigation.optional');
    intl.completedLabel = localization.message('navigation.completed');
    intl.editableLabel = localization.message('navigation.editable');
    intl.changes.next();
  });
  return intl;
}

/** Host-supplied validity guards forward navigation; no domain-specific workflow state. */
@Component({
  selector: 'haven-stepper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, MatStepperModule, MatButtonModule, HavenGlassSurface],
  providers: [{ provide: MatStepperIntl, useFactory: stepperIntl }],
  templateUrl: './stepper.html',
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .actions {
      display: flex;
      gap: var(--haven-gap-sm);
      padding: var(--haven-gap-md);
    }
    [role='alert'] {
      color: var(--mat-sys-error);
      padding: var(--haven-gap-md);
    }
  `,
})
export class HavenStepper {
  readonly localization = inject(HavenLocalization);
  readonly title = input<string | LocalizedText>('');
  readonly linear = input(false);
  readonly activeId = model<string | null>(null);
  readonly attempted = output<string>();
  readonly panels = contentChildren(HavenPanel);
  readonly control = viewChild(MatStepper);
  readonly #ready = signal(false);
  readonly unsupportedDisabled = computed(() => this.panels().some((panel) => panel.disabled()));
  readonly selectedIndex = computed(() => {
    const panels = this.panels();
    let index = Math.max(
      0,
      panels.findIndex((panel) => panel.id() === this.activeId()),
    );
    if (this.linear()) {
      const blocked = panels.findIndex((panel) => !panel.valid() && !panel.optional());
      if (blocked >= 0) index = Math.min(index, blocked);
    }
    return index;
  });
  readonly selectedId = computed(() => this.panels()[this.selectedIndex()]?.id() ?? null);
  constructor() {
    afterNextRender(() => this.#ready.set(true));
    effect(() => {
      if (this.#ready() && this.activeId() !== this.selectedId())
        this.activeId.set(this.selectedId());
    });
  }
  select(index: number): void {
    const panel = this.panels()[index];
    if (panel && !this.unsupportedDisabled()) this.activeId.set(panel.id());
  }
  previous(): void {
    if (!this.unsupportedDisabled()) this.control()?.previous();
  }
  next(): void {
    if (!this.unsupportedDisabled()) this.control()?.next();
  }
}
