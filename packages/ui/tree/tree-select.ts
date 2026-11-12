import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  model,
  signal,
  untracked,
} from '@angular/core';
import type { Signal } from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { HavenFieldPresentation } from '@haven/ui/form';
import { HavenLocalization } from '@haven/ui';
import { HavenGlassSurface } from '@haven/ui/glass';
import { HAVEN_THEME_CONTEXT, applyHavenTheme } from '@haven/ui/theme';
import { indexTree, treePath } from '@haven/schema';
import type { HavenTheme, TreeKey, TreeNode } from '@haven/schema';
import { HavenTree } from './tree';

interface PickerData {
  nodes: readonly TreeNode[];
  value: TreeKey | null;
  expanded: readonly TreeKey[];
  title: string;
  filterable: boolean;
  leafOnly: boolean;
  theme?: Signal<HavenTheme>;
}
@Component({
  selector: 'haven-tree-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, HavenTree],
  template: `<h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content
      ><haven-tree
        [nodes]="data.nodes"
        [title]="data.title"
        [activeKey]="data.value"
        [expandedKeys]="data.expanded"
        [filterable]="data.filterable"
        [leafOnly]="data.leafOnly"
        [selection]="true"
        (activate)="dialog.close($event)"
    /></mat-dialog-content>
    <mat-dialog-actions
      ><button matButton mat-dialog-close>
        {{ localization.message('tree.cancel') }}
      </button></mat-dialog-actions
    >`,
})
export class HavenTreePicker {
  readonly data = inject<PickerData>(MAT_DIALOG_DATA);
  readonly dialog = inject<MatDialogRef<HavenTreePicker, TreeKey>>(MatDialogRef);
  readonly localization = inject(HavenLocalization);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef);
  constructor() {
    effect((cleanup) => {
      const theme = this.data.theme?.();
      if (theme) cleanup(applyHavenTheme(this.#element.nativeElement, theme));
    });
  }
}
/** A scalar Signal Forms field with a Material dialog picker and independent clearing. */
@Component({
  selector: 'haven-tree-select-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatFormFieldModule, MatInputModule, HavenGlassSurface],
  templateUrl: './tree-select.html',
  styleUrl: './fields.scss',
})
export class HavenTreeSelectField
  extends HavenFieldPresentation
  implements FormValueControl<TreeKey | null>
{
  readonly nodes = input<readonly TreeNode[]>([]);
  readonly filterable = input(true);
  readonly leafOnly = input(false);
  readonly emptyValue = input<'' | null>(null);
  readonly value = model<TreeKey | null>(null);
  readonly index = computed(() => indexTree(this.nodes()));
  readonly selected = computed(() => this.index()?.entries.get(this.value()!)?.node);
  readonly display = computed(() =>
    this.selected()
      ? this.localization.text(this.selected()!.label)
      : this.value() === null || this.value() === ''
        ? ''
        : String(this.value()),
  );
  readonly unknown = computed(
    () => this.value() !== null && this.value() !== '' && !this.selected(),
  );
  readonly #dialogs = inject(MatDialog);
  readonly #theme = inject(HAVEN_THEME_CONTEXT, { optional: true });
  readonly #destroy = inject(DestroyRef);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly #dialog = signal<MatDialogRef<HavenTreePicker, TreeKey> | undefined>(undefined);
  protected override focusOverlay(): HTMLElement | undefined {
    const ref = this.#dialog();
    // MatDialogRef.id identifies its public dialog container, including the focus trap.
    return ref
      ? (this.#element.nativeElement.ownerDocument.getElementById(ref.id) ?? undefined)
      : undefined;
  }
  constructor() {
    super();
    this.#destroy.onDestroy(() => this.#dialog()?.close());
    effect(() => {
      this.nodes();
      this.disabled();
      this.readonly();
      this.leafOnly();
      // An open picker must not commit a snapshot after its host configuration changes.
      untracked(() => this.#dialog()?.close());
    });
  }
  open(): void {
    const index = this.index();
    if (this.disabled() || this.readonly() || !index || this.#dialog()) return;
    const ref = this.#dialogs.open<HavenTreePicker, PickerData, TreeKey>(HavenTreePicker, {
      data: {
        nodes: index.roots,
        value: this.value(),
        title: this.label(),
        expanded: treePath(index, this.value()!)
          .slice(0, -1)
          .map((node) => node.key),
        filterable: this.filterable(),
        leafOnly: this.leafOnly(),
        ...(this.#theme ? { theme: this.#theme } : {}),
      },
      autoFocus: 'first-tabbable',
      restoreFocus: true,
    });
    this.#dialog.set(ref);
    ref.afterClosed().subscribe((key) => {
      if (this.#dialog() === ref) this.#dialog.set(undefined);
      if (this.#destroy.destroyed) return;
      const entry = key === undefined ? undefined : this.index()?.entries.get(key);
      if (
        entry &&
        !entry.disabled &&
        !this.disabled() &&
        !this.readonly() &&
        (!this.leafOnly() || !entry.node.children?.length)
      )
        this.value.set(entry.node.key);
      this.touch.emit();
    });
  }
  clear(): void {
    if (this.disabled() || this.readonly()) return;
    this.value.set(this.emptyValue());
    this.touch.emit();
  }
  focus(options?: FocusOptions): void {
    const selector = this.readonly() ? '[data-display]' : '[data-picker]';
    this.#element.nativeElement.querySelector<HTMLElement>(selector)?.focus(options);
  }
}
