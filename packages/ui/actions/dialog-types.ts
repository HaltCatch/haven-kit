import type { Signal } from '@angular/core';
import type { MatDialogConfig } from '@angular/material/dialog';
import type { HavenTheme, LocalizedText } from '@haven/schema';

/** Native Material options, plus an optional per-dialog theme. Use viewContainerRef to scope ownership. */
export type HavenDialogOptions<D = unknown> = MatDialogConfig<D> & { theme?: Signal<HavenTheme> };
export interface HavenConfirmData {
  title: string | LocalizedText;
  message: string | LocalizedText;
  confirmLabel?: string | LocalizedText;
  cancelLabel?: string | LocalizedText;
  destructive?: boolean;
}
/** Confirmation always remains dismissible; cancellation is never treated as consent. */
export type HavenConfirmOptions = HavenConfirmData &
  Omit<
    HavenDialogOptions<never>,
    | 'data'
    | 'role'
    | 'autoFocus'
    | 'restoreFocus'
    | 'disableClose'
    | 'closePredicate'
    | 'ariaLabel'
    | 'ariaLabelledBy'
  >;
