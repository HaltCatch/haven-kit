import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import type { LocalizedText } from '@haven/schema';
import { HavenLocalization } from '@haven/ui';

/** Read-only progress. Null means not yet measurable; finite values are percentages in [0, 100]. */
@Component({
  selector: 'haven-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatProgressBarModule],
  template: `
    @if (invalid()) {
      <p role="alert">{{ localization.message('display.progressInvalid') }}</p>
    } @else {
      <div class="label">
        <span>{{ accessibleLabel() }}</span>
        @if (showValue() && effectiveMode() === 'determinate') {
          <span aria-hidden="true">{{ percentage() }}</span>
        }
      </div>
      <mat-progress-bar
        [mode]="effectiveMode()"
        [value]="value() ?? 0"
        [attr.aria-label]="accessibleLabel()"
        [attr.aria-valuetext]="effectiveMode() === 'determinate' ? percentage() : null"
      />
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .label {
      display: flex;
      justify-content: space-between;
      gap: var(--haven-gap-sm);
      padding-block-end: var(--haven-gap-xs);
      overflow-wrap: anywhere;
    }
    [role='alert'] {
      color: var(--mat-sys-error);
    }
  `,
})
export class HavenProgress {
  readonly localization = inject(HavenLocalization);
  readonly label = input<string | LocalizedText>('');
  readonly value = input<number | null>(null);
  readonly mode = input<'determinate' | 'indeterminate'>('determinate');
  readonly showValue = input(true);
  readonly effectiveMode = computed(() =>
    this.mode() === 'indeterminate' || this.value() === null ? 'indeterminate' : 'determinate',
  );
  readonly invalid = computed(
    () =>
      this.effectiveMode() === 'determinate' &&
      (!Number.isFinite(this.value()) || this.value()! < 0 || this.value()! > 100),
  );
  readonly accessibleLabel = computed(
    () =>
      this.localization.text(this.label()) || this.localization.message('display.progressLabel'),
  );
  readonly percentage = computed(() =>
    this.localization.number((this.value() ?? 0) / 100, {
      style: 'percent',
      maximumFractionDigits: 1,
    }),
  );
}
