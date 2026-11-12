import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  contentChild,
  inject,
  input,
} from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import type { MatCardAppearance } from '@angular/material/card';
import type { LocalizedText } from '@haven/schema';
import { HavenLocalization } from '@haven/ui';

/** Mark projected host actions; the container does not invent navigation or business actions. */
@Directive({ selector: '[havenCardActions]' })
export class HavenCardActions {}

@Component({
  selector: 'haven-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCardModule],
  template: `
    <mat-card
      [appearance]="appearance()"
      [attr.role]="localization.text(title()) ? 'group' : null"
      [attr.aria-label]="localization.text(title()) || null"
    >
      @if (localization.text(title()) || localization.text(subtitle())) {
        <mat-card-header>
          @if (localization.text(title())) {
            <mat-card-title>{{ localization.text(title()) }}</mat-card-title>
          }
          @if (localization.text(subtitle())) {
            <mat-card-subtitle>{{ localization.text(subtitle()) }}</mat-card-subtitle>
          }
        </mat-card-header>
      }
      <mat-card-content><ng-content /></mat-card-content>
      @if (actions()) {
        <mat-card-actions><ng-content select="[havenCardActions]" /></mat-card-actions>
      }
    </mat-card>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    mat-card-content {
      display: flex;
      flex-direction: column;
      gap: var(--haven-gap-md);
      padding-block: var(--haven-gap-md);
      overflow-wrap: anywhere;
    }
  `,
})
export class HavenCard {
  readonly localization = inject(HavenLocalization);
  readonly title = input<string | LocalizedText>('');
  readonly subtitle = input<string | LocalizedText>('');
  readonly appearance = input<MatCardAppearance>('outlined');
  readonly actions = contentChild(HavenCardActions);
}
