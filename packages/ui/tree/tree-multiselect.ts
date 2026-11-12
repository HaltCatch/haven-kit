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
import type { FormValueControl } from '@angular/forms/signals';
import { MatDialog } from '@angular/material/dialog';
import type { MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { HavenFieldPresentation } from '@haven/ui/form';
import { HavenGlassSurface } from '@haven/ui/glass';
import { HAVEN_THEME_CONTEXT } from '@haven/ui/theme';
import { indexTree, isTreeSelection, isTreeMultipleValue } from '@haven/schema';
import type { TreeKey, TreeNode } from '@haven/schema';
import { HavenTreeMultiplePicker } from './multiple-picker';
import type { MultiplePickerData } from './multiple-picker';
@Component({
  selector: 'haven-tree-multiselect-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatFormFieldModule, MatInputModule, HavenGlassSurface],
  templateUrl: './tree-multiselect.html',
  styleUrl: './fields.scss',
})
export class HavenTreeMultiselectField
  extends HavenFieldPresentation
  implements FormValueControl<TreeKey[]>
{
  readonly nodes = input<readonly TreeNode[]>([]);
  readonly filterable = input(true);
  readonly leafOnly = input(false);
  readonly cascade = input(false);
  readonly identity = input('');
  readonly value = model<TreeKey[]>([]);
  readonly index = computed(() => indexTree(this.nodes()));
  readonly validValue = computed(() => isTreeSelection(this.value()));
  readonly invalidSelection = computed(
    () => !isTreeMultipleValue(this.value(), this.nodes(), this.leafOnly()),
  );
  readonly display = computed(() =>
    this.validValue()
      ? this.value()
          .map((key) => {
            const node = this.index()?.entries.get(key)?.node;
            return node ? this.localization.text(node.label) : String(key);
          })
          .join(', ')
      : '',
  );
  readonly #dialogs = inject(MatDialog);
  readonly #theme = inject(HAVEN_THEME_CONTEXT, { optional: true });
  readonly #destroy = inject(DestroyRef);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly #dialog = signal<MatDialogRef<HavenTreeMultiplePicker, TreeKey[]> | undefined>(
    undefined,
  );
  protected override focusOverlay(): HTMLElement | undefined {
    const ref = this.#dialog();
    return ref
      ? (this.#element.nativeElement.ownerDocument.getElementById(ref.id) ?? undefined)
      : undefined;
  }
  constructor() {
    super();
    this.#destroy.onDestroy(() => this.#dialog()?.close());
    effect(() => {
      this.nodes();
      this.value();
      this.identity();
      this.disabled();
      this.readonly();
      this.leafOnly();
      this.cascade();
      this.filterable();
      untracked(() => this.#dialog()?.close());
    });
  }
  open(): void {
    const index = this.index();
    if (this.disabled() || this.readonly() || !index || !this.validValue() || this.#dialog())
      return;
    const baseline = this.value(),
      nodes = this.nodes(),
      identity = this.identity(),
      leafOnly = this.leafOnly(),
      cascade = this.cascade(),
      filterable = this.filterable();
    const expanded = new Set(
      baseline.flatMap((key) => index.entries.get(key)?.path.slice(0, -1) ?? []),
    );
    const ref = this.#dialogs.open<HavenTreeMultiplePicker, MultiplePickerData, TreeKey[]>(
      HavenTreeMultiplePicker,
      {
        data: {
          nodes: index.roots,
          value: [...baseline],
          title: this.label,
          expanded: [...expanded],
          leafOnly,
          cascade,
          filterable,
          ...(this.#theme ? { theme: this.#theme } : {}),
        },
        autoFocus: 'first-tabbable',
        restoreFocus: true,
      },
    );
    this.#dialog.set(ref);
    ref.afterClosed().subscribe((keys) => {
      if (this.#dialog() === ref) this.#dialog.set(undefined);
      if (this.#destroy.destroyed) return;
      if (
        keys !== undefined &&
        isTreeSelection(keys) &&
        this.value() === baseline &&
        this.nodes() === nodes &&
        this.identity() === identity &&
        this.leafOnly() === leafOnly &&
        this.cascade() === cascade &&
        this.filterable() === filterable &&
        !this.disabled() &&
        !this.readonly()
      ) {
        // Locked/unknown baseline values remain representable; only newly introduced keys need eligibility.
        const original = new Set(baseline),
          current = this.index();
        if (
          current &&
          keys.every(
            (key) =>
              original.has(key) ||
              (!!current.entries.get(key) &&
                !current.entries.get(key)!.disabled &&
                (!leafOnly || !current.entries.get(key)!.node.children?.length)),
          )
        )
          this.value.set([...keys]);
      }
      this.touch.emit();
    });
  }
  clear(): void {
    if (this.disabled() || this.readonly()) return;
    this.value.set([]);
    this.touch.emit();
  }
  focus(options?: FocusOptions): void {
    this.#element.nativeElement
      .querySelector<HTMLElement>(this.readonly() ? '[data-display]' : '[data-picker]')
      ?.focus(options);
  }
}
