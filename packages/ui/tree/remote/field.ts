import {
  DestroyRef,
  Directive,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import type { Signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import type { MatDialogRef } from '@angular/material/dialog';
import { isTreeSelection } from '@haven/schema';
import type { TreeKey } from '@haven/schema';
import type { TreeDataSource } from '@haven/runtime';
import { HavenFieldPresentation } from '@haven/ui/form';
import { HAVEN_THEME_CONTEXT } from '@haven/ui/theme';
import { injectTreeData } from './data';
import { remoteTreeFieldState } from './field-state';
import type { HavenTreeResolution } from './field-state';
import { HavenRemoteTreePicker } from './picker';
import type { RemotePickerData } from './picker';

/** Host fetching and permissions remain explicit; all picker edits are transactional. */
@Directive()
export abstract class RemoteTreeField extends HavenFieldPresentation {
  abstract readonly selectedKeys: Signal<readonly TreeKey[]>;
  abstract readonly validValue: Signal<boolean>;
  abstract readonly multiple: boolean;
  abstract commit(keys: readonly TreeKey[]): void;
  readonly source = input<TreeDataSource>();
  readonly identity = input('');
  readonly active = input<() => boolean>(() => true);
  readonly editActive = input<() => boolean>(() => true);
  readonly filterable = input(true);
  readonly leafOnly = input(false);
  readonly resolution = output<HavenTreeResolution>();
  readonly data = injectTreeData(
    () => this.source(),
    () => !this.disabled() && this.active()(),
  );
  readonly membership = remoteTreeFieldState(
    this.data,
    () => this.selectedKeys(),
    () => this.validValue(),
    () => this.leafOnly(),
    (value) => this.localization.text(value),
    () => this.source(),
    () => this.localization.locale(),
  );
  readonly display = computed(() =>
    this.validValue()
      ? this.selectedKeys()
          .map((key) => {
            const entry = this.data.state().entries.get(key);
            return entry ? this.localization.text(entry.node.label) : String(key);
          })
          .join(', ')
      : '',
  );
  readonly unavailable = computed(() => !this.source() || this.membership.resolution().failed);
  readonly blocked = computed(
    () => this.disabled() || this.readonly() || !this.active()() || !this.editActive()(),
  );
  readonly #dialogs = inject(MatDialog);
  readonly #theme = inject(HAVEN_THEME_CONTEXT, { optional: true });
  readonly #destroy = inject(DestroyRef);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly #dialog = signal<MatDialogRef<HavenRemoteTreePicker, TreeKey[]> | undefined>(undefined);
  protected override focusOverlay(): HTMLElement | undefined {
    const ref = this.#dialog();
    return ref
      ? (this.#element.nativeElement.ownerDocument.getElementById(ref.id) ?? undefined)
      : undefined;
  }
  constructor() {
    super();
    this.#destroy.onDestroy(() => this.#dialog()?.close());
    effect(() => this.resolution.emit(this.membership.resolution()));
    effect(() => {
      this.source();
      this.identity();
      this.selectedKeys();
      this.disabled();
      this.readonly();
      this.active()();
      this.editActive()();
      this.leafOnly();
      this.filterable();
      // Cache and locale updates deliberately do not close an in-progress selection.
      untracked(() => this.#dialog()?.close());
    });
  }
  open(): void {
    if (this.blocked() || !this.data.current() || !this.validValue() || this.#dialog()) return;
    const baseline = this.selectedKeys(),
      source = this.source()!,
      identity = this.identity(),
      leafOnly = this.leafOnly(),
      filterable = this.filterable();
    const live = () =>
      !this.#destroy.destroyed &&
      !this.blocked() &&
      this.data.current() &&
      this.source()?.identity === source.identity &&
      this.source()?.adapter === source.adapter &&
      this.identity() === identity &&
      this.selectedKeys() === baseline &&
      this.leafOnly() === leafOnly &&
      this.filterable() === filterable;
    const ref = this.#dialogs.open<HavenRemoteTreePicker, RemotePickerData, TreeKey[]>(
      HavenRemoteTreePicker,
      {
        data: {
          data: this.data,
          value: [...baseline],
          title: this.label,
          leafOnly,
          filterable,
          multiple: this.multiple,
          active: live,
          expanded: [
            ...new Set(
              baseline.flatMap(
                (key) => this.data.state().entries.get(key)?.path.slice(0, -1) ?? [],
              ),
            ),
          ],
          ...(this.#theme ? { theme: this.#theme } : {}),
        },
        autoFocus: 'first-tabbable',
        restoreFocus: true,
      },
    );
    this.#dialog.set(ref);
    ref.afterClosed().subscribe((keys) => {
      if (this.#dialog() === ref) this.#dialog.set(undefined);
      if (!live()) return;
      if (
        keys !== undefined &&
        isTreeSelection(keys) &&
        (this.multiple || keys.length <= 1) &&
        keys.every((key) => {
          const entry = this.data.state().entries.get(key);
          return (
            entry &&
            (!entry.disabled || baseline.includes(key)) &&
            (!leafOnly || !entry.node.hasChildren)
          );
        })
      )
        this.commit(keys);
      this.touch.emit();
    });
  }
  retry(): void {
    if (!this.disabled() && this.active()() && this.data.current())
      void this.data.loader.retryResolve();
  }
  clear(): void {
    if (this.blocked() || this.#destroy.destroyed) return;
    this.commit([]);
    this.touch.emit();
  }
  focus(options?: FocusOptions): void {
    this.#element.nativeElement
      .querySelector<HTMLElement>(this.readonly() ? '[data-display]' : '[data-picker]')
      ?.focus(options);
  }
}
