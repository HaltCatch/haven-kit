import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  contentChild,
  inject,
  input,
} from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { HavenLocalization } from '@haven/ui';
import type { LocalizedText } from '@haven/schema';

@Directive({ selector: '[havenDialogActions]' })
export class HavenDialogActions {}

/** Use inside a native Material dialog; the native title/content/actions own dialog semantics. */
@Component({
  selector: 'haven-dialog-content',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule],
  template: `<h2 mat-dialog-title>
      {{ localization.text(title()) || localization.message('dialog.title') }}
    </h2>
    <mat-dialog-content><ng-content /></mat-dialog-content>
    @if (actions()) {
      <mat-dialog-actions align="end"
        ><ng-content select="[havenDialogActions]"
      /></mat-dialog-actions>
    }`,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    mat-dialog-content {
      overflow-wrap: anywhere;
    }
  `,
})
export class HavenDialogContent {
  readonly localization = inject(HavenLocalization);
  readonly title = input.required<string | LocalizedText>();
  readonly actions = contentChild(HavenDialogActions);
}
