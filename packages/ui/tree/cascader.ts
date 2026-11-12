import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  model,
  signal,
  viewChildren,
} from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';
import { MatSelect, MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { HavenFieldPresentation } from '@haven/ui/form';
import { HavenGlassSurface } from '@haven/ui/glass';
import { HAVEN_THEME_CONTEXT, applyHavenTheme } from '@haven/ui/theme';
import { filterTree, indexTree, treePath } from '@haven/schema';
import type { TreeKey, TreeNode } from '@haven/schema';

/** Progressive level selection. Exploring a branch does not overwrite the saved leaf value. */
@Component({
  selector: 'haven-cascader-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    HavenGlassSurface,
  ],
  templateUrl: './cascader.html',
  styleUrl: './fields.scss',
})
export class HavenCascaderField
  extends HavenFieldPresentation
  implements FormValueControl<TreeKey | null>
{
  readonly nodes = input<readonly TreeNode[]>([]);
  readonly filterable = input(true);
  readonly emptyValue = input<'' | null>(null);
  readonly value = model<TreeKey | null>(null);
  readonly filter = signal('');
  readonly index = computed(() => indexTree(this.nodes()));
  readonly path = linkedSignal({
    source: () => ({ index: this.index(), value: this.value() }),
    computation: (current, previous): TreeKey[] => {
      if (!current.index) return [];
      if (previous && previous.source.value === current.value) {
        const last = previous.value.at(-1);
        const candidate =
          last === undefined ? [] : treePath(current.index, last).map((node) => node.key);
        if (
          candidate.length === previous.value.length &&
          candidate.every((key, at) => key === previous.value[at])
        )
          return [...previous.value];
      }
      return current.value === null || current.value === ''
        ? []
        : treePath(current.index, current.value).map((node) => node.key);
    },
  });
  readonly levels = computed(() => {
    const index = this.index();
    if (!index) return [];
    let nodes = filterTree(index, this.filter(), (node) => this.localization.text(node.label));
    const levels: { options: readonly TreeNode[]; selected: TreeKey | undefined }[] = [];
    for (let level = 0; nodes.length && level < 32; level++) {
      const selected = this.path()[level];
      levels.push({ options: nodes, selected });
      nodes = nodes.find((node) => node.key === selected)?.children ?? [];
    }
    return levels;
  });
  readonly display = computed(() => {
    const value = this.value(),
      index = this.index();
    if (value === null || value === '') return '';
    const nodes = index ? treePath(index, value) : [];
    return nodes.length
      ? nodes.map((node) => this.localization.text(node.label)).join(' / ')
      : String(value);
  });
  readonly unknown = computed(() => {
    const value = this.value();
    if (value === null || value === '') return false;
    const node = this.index()?.entries.get(value)?.node;
    return !node || !!node.children?.length;
  });
  readonly controls = viewChildren(MatSelect);
  readonly #opened = signal(false);
  readonly #theme = inject(HAVEN_THEME_CONTEXT, { optional: true });
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef);
  protected override focusOverlay(): HTMLElement | undefined {
    this.#opened();
    return this.controls().find((control) => control.panelOpen)?.panel?.nativeElement as
      HTMLElement | undefined;
  }
  constructor() {
    super();
    effect((cleanup) => {
      const theme = this.#theme?.();
      this.#opened();
      const panel = this.focusOverlay();
      if (theme && panel) cleanup(applyHavenTheme(panel, theme));
    });
  }
  opened(value: boolean): void {
    this.#opened.set(value);
  }
  blocked(node: TreeNode): boolean {
    return this.index()?.entries.get(node.key)?.disabled ?? true;
  }
  select(level: number, key: TreeKey): void {
    if (this.disabled() || this.readonly()) return;
    const node = this.levels()[level]?.options.find((node) => node.key === key);
    if (!node || this.blocked(node)) return;
    this.path.set([...this.path().slice(0, level), key]);
    if (!node.children?.length) this.value.set(key);
    this.touch.emit();
  }
  clear(): void {
    if (this.disabled() || this.readonly()) return;
    this.value.set(this.emptyValue());
    this.path.set([]);
    this.touch.emit();
  }
  focus(options?: FocusOptions): void {
    const control = this.controls().find((control) => !control.disabled);
    if (control) control.focus(options);
    else this.#element.nativeElement.querySelector<HTMLInputElement>('input')?.focus(options);
  }
}
