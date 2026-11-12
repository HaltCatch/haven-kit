import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import type { LocalizedText } from '@haven/schema';
import { HavenLocalization } from '@haven/ui';
import type { HavenDisplayTone } from './tone';

/** Inline feedback. Severity and announcement policy are explicit; the host owns visibility after dismissal. */
@Component({
  selector: 'haven-alert',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule],
  template: `
    <section
      [attr.role]="announce() ? 'alert' : null"
      [attr.aria-label]="localization.text(title()) || null"
    >
      <div class="content">
        @if (localization.text(title())) {
          <strong>{{ localization.text(title()) }}</strong>
        }
        <p>{{ localization.text(message()) }}</p>
        <ng-content />
      </div>
      @if (dismissible()) {
        <button matButton type="button" [disabled]="disabled() || readonly()" (click)="dismiss()">
          {{ localization.message('display.dismiss') }}
        </button>
      }
    </section>
  `,
  styleUrls: ['./tone.scss', './alert.scss'],
  host: { '[attr.data-tone]': 'tone()' },
})
export class HavenAlert {
  readonly localization = inject(HavenLocalization);
  readonly title = input<string | LocalizedText>('');
  readonly message = input<string | LocalizedText>('');
  readonly tone = input<HavenDisplayTone>('info');
  readonly announce = input(true);
  readonly dismissible = input(false);
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly dismissed = output<void>();
  dismiss(): void {
    if (!this.dismissible() || this.disabled() || this.readonly()) return;
    this.dismissed.emit();
  }
}
