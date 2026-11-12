import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { MatDividerModule } from '@angular/material/divider';
import type { LocalizedText } from '@haven/schema';
import { HavenLocalization } from '@haven/ui';

@Component({
  selector: 'haven-divider',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDividerModule],
  template: `<mat-divider
    [vertical]="vertical()"
    [inset]="inset()"
    [attr.aria-label]="localization.text(label()) || null"
  />`,
  styles: `
    :host {
      display: block;
      align-self: stretch;
    }
    :host(.vertical) {
      display: flex;
      min-block-size: var(--haven-gap-lg);
    }
  `,
  host: { '[class.vertical]': 'vertical()' },
})
export class HavenDivider {
  readonly localization = inject(HavenLocalization);
  readonly vertical = input(false);
  readonly inset = input(false);
  readonly label = input<string | LocalizedText>('');
}
