import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { HavenLocalization } from '@haven/ui';
import { HavenDialogContent, HavenDialogActions } from './dialog-content';
import type { HavenConfirmData } from './dialog-types';

/** Trusted host data only. No action names, expression evaluation or model-driven component loading. */
@Component({
  selector: 'haven-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HavenDialogContent, HavenDialogActions, MatButtonModule],
  template: `<haven-dialog-content [title]="data.title">
    <p>{{ localization.text(data.message) }}</p>
    <button
      havenDialogActions
      matButton
      type="button"
      cdkFocusInitial
      (click)="dialog.close(false)"
    >
      {{ localization.text(data.cancelLabel) || localization.message('dialog.cancel') }}
    </button>
    <button
      havenDialogActions
      matButton="filled"
      type="button"
      [class.destructive]="data.destructive"
      (click)="dialog.close(true)"
    >
      {{ localization.text(data.confirmLabel) || localization.message('dialog.confirm') }}
    </button>
  </haven-dialog-content>`,
  styles: `
    .destructive {
      --mat-button-filled-container-color: var(--mat-sys-error);
      --mat-button-filled-label-text-color: var(--mat-sys-on-error);
    }
    p {
      margin: 0;
    }
  `,
})
export class HavenConfirmDialog {
  readonly data = inject<HavenConfirmData>(MAT_DIALOG_DATA);
  readonly dialog = inject<MatDialogRef<HavenConfirmDialog, boolean>>(MatDialogRef);
  readonly localization = inject(HavenLocalization);
}
