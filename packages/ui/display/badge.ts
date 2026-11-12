import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import type { LocalizedText } from '@haven/schema';
import { HavenLocalization } from '@haven/ui';
import type { HavenDisplayTone } from './tone';

/** A non-interactive status label, not a selectable chip or a notification-count badge. */
@Component({
  selector: 'haven-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [attr.role]="announce() ? 'status' : null">{{
    localization.text(text())
  }}</span>`,
  styleUrls: ['./tone.scss', './badge.scss'],
  host: { '[attr.data-tone]': 'tone()' },
})
export class HavenBadge {
  readonly localization = inject(HavenLocalization);
  readonly text = input<string | LocalizedText>('');
  readonly tone = input<HavenDisplayTone>('neutral');
  readonly announce = input(false);
}
