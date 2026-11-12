import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import type { LocalizedText } from '@haven/schema';
import { HavenLocalization } from '@haven/ui';

export type HavenToolbarOrientation = 'horizontal' | 'vertical';
export type HavenToolbarAlignment = 'start' | 'center' | 'end' | 'space-between';
export type HavenToolbarGap = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/** Projection preserves native button/input semantics. The host owns actions and their disabled state. */
@Component({
  selector: 'haven-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatToolbarModule],
  template: `<mat-toolbar
    class="toolbar"
    role="toolbar"
    [attr.aria-label]="localization.text(label()) || localization.message('actions.toolbar')"
    [attr.aria-orientation]="orientation()"
    [style.flex-direction]="orientation() === 'vertical' ? 'column' : 'row'"
    [style.flex-wrap]="wrap() ? 'wrap' : 'nowrap'"
    [style.justify-content]="align()"
    [style.align-items]="orientation() === 'vertical' ? 'stretch' : 'center'"
    [style.gap]="'var(--haven-gap-' + gap() + ')'"
  >
    <ng-content />
  </mat-toolbar>`,
  styleUrl: './toolbar.scss',
})
export class HavenToolbar {
  readonly localization = inject(HavenLocalization);
  readonly label = input<string | LocalizedText>('');
  readonly orientation = input<HavenToolbarOrientation>('horizontal');
  readonly wrap = input(true);
  readonly align = input<HavenToolbarAlignment>('start');
  readonly gap = input<HavenToolbarGap>('sm');
}
