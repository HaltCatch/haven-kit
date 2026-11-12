import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, Injector, afterRenderEffect, inject } from '@angular/core';
import type { ComponentType } from '@angular/cdk/portal';
import { MatDialog } from '@angular/material/dialog';
import type { MatDialogRef } from '@angular/material/dialog';
import { HAVEN_THEME_CONTEXT, applyHavenTheme } from '@haven/ui/theme';
import { firstValueFrom } from 'rxjs';
import { HavenConfirmDialog } from './confirm-dialog';
import type { HavenConfirmData, HavenConfirmOptions, HavenDialogOptions } from './dialog-types';

/** MatDialog remains the sole overlay/focus/lifecycle owner; this adds scoped theme and typed convenience. */
@Injectable({ providedIn: 'root' })
export class HavenDialog {
  readonly #dialogs = inject(MatDialog);
  readonly #injector = inject(Injector);
  readonly #document = inject(DOCUMENT);

  open<C, D = unknown, R = unknown>(
    component: ComponentType<C>,
    options: HavenDialogOptions<D> = {},
  ): MatDialogRef<C, R> {
    const { theme: override, ...native } = options;
    const owner = native.injector ?? native.viewContainerRef?.injector ?? this.#injector;
    const theme = override ?? owner.get(HAVEN_THEME_CONTEXT, null);
    const scoped = theme
      ? Injector.create({
          parent: owner,
          providers: [{ provide: HAVEN_THEME_CONTEXT, useValue: theme }],
        })
      : undefined;
    let ref: MatDialogRef<C, R>;
    try {
      ref = this.#dialogs.open<C, D, R>(component, {
        autoFocus: 'first-tabbable',
        restoreFocus: true,
        ...native,
        ...(scoped ? { injector: scoped } : {}),
      });
    } catch (error) {
      scoped?.destroy();
      throw error;
    }
    // Theme restoration reads previous inline values, so this hook intentionally uses mixedReadWrite.
    const themed = theme
      ? afterRenderEffect(
          {
            mixedReadWrite: (cleanup) => {
              const current = theme();
              // MatDialogRef.id is the public container identity; never mutate the global OverlayContainer.
              const container = this.#document.getElementById(ref.id);
              if (container) cleanup(applyHavenTheme(container, current));
            },
          },
          { injector: owner, manualCleanup: true },
        )
      : undefined;
    const unregister = owner.get(DestroyRef).onDestroy(() => ref.close());
    ref.afterClosed().subscribe(() => {
      themed?.destroy();
      unregister();
      scoped?.destroy();
    });
    return ref;
  }

  async confirm(options: HavenConfirmOptions): Promise<boolean> {
    const { title, message, confirmLabel, cancelLabel, destructive, ...config } = options;
    const data: HavenConfirmData = {
      title,
      message,
      ...(confirmLabel === undefined ? {} : { confirmLabel }),
      ...(cancelLabel === undefined ? {} : { cancelLabel }),
      ...(destructive === undefined ? {} : { destructive }),
    };
    const ref = this.open<HavenConfirmDialog, HavenConfirmData, boolean>(HavenConfirmDialog, {
      ...config,
      data,
      role: 'alertdialog',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
      disableClose: false,
    });
    return (await firstValueFrom(ref.afterClosed())) === true;
  }
}
