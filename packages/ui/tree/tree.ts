import { SelectionModel } from '@angular/cdk/collections';
import { MatPseudoCheckbox } from '@angular/material/core';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  untracked,
  viewChild,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { MatTree, MatTreeModule } from '@angular/material/tree';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { HavenLocalization } from '@haven/ui';
import { HavenGlassSurface } from '@haven/ui/glass';
import { filterTree, indexTree, isTreeSelection, treeCascadeKeys, treeChecks } from '@haven/schema';
import type { TreeKey, TreeNode } from '@haven/schema';
import { toggleTreeCascade } from './cascade-selection';

/** Native CDK tree keyboard/expansion behavior; no routing or business permissions. */
@Component({
  selector: 'haven-tree',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatPseudoCheckbox,
    MatTreeModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    HavenGlassSurface,
  ],
  templateUrl: './tree.html',
  styleUrl: './tree.scss',
})
export class HavenTree {
  readonly localization = inject(HavenLocalization);
  readonly nodes = input<readonly TreeNode[]>([]);
  readonly title = input('');
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly filterable = input(false);
  readonly leafOnly = input(false);
  readonly selection = input(false);
  readonly multiple = input(false);
  readonly cascade = input(false);
  readonly selectedKeys = model<TreeKey[]>([]);
  readonly selected = computed(
    () => new Set(isTreeSelection(this.selectedKeys()) ? this.selectedKeys() : []),
  );
  readonly validSelection = computed(() => isTreeSelection(this.selectedKeys()));
  readonly selectionLimited = signal(false);
  readonly checks = computed(() => {
    const index = this.index();
    return index && this.multiple() && this.cascade()
      ? treeChecks(index, this.selected(), this.leafOnly())
      : undefined;
  });
  readonly activeKey = model<TreeKey | null>(null);
  readonly expandedKeys = model<readonly TreeKey[]>([]);
  readonly filter = model('');
  readonly #expanded = computed(() => new Set(this.expandedKeys()));
  readonly activate = output<TreeKey>();
  readonly index = computed(() => indexTree(this.nodes()));
  readonly filtered = computed(() => {
    const index = this.index();
    return index
      ? [...filterTree(index, this.filter(), (node) => this.localization.text(node.label))]
      : [];
  });
  readonly control = viewChild(MatTree<TreeNode, TreeKey>);
  #syncingExpansion = false;
  constructor() {
    effect(() => {
      this.nodes();
      this.selectedKeys();
      this.cascade();
      this.leafOnly();
      this.multiple();
      this.selectionLimited.set(false);
    });
    effect(() => {
      const tree = this.control(),
        index = this.index();
      this.filtered();
      this.expandedKeys();
      this.filter();
      if (!tree || !index) return;
      untracked(() => {
        this.#syncingExpansion = true;
        try {
          for (const { node } of index.entries.values()) {
            if (!node.children?.length) continue;
            if (this.expanded(node)) tree.expand(node);
            else tree.collapse(node);
          }
        } finally {
          this.#syncingExpansion = false;
        }
      });
    });
  }
  readonly children = (node: TreeNode) => node.children ?? [];
  readonly expansionKey = (node: TreeNode) => node.key;
  readonly track = (_: number, node: TreeNode) => node.key;
  expanded(node: TreeNode): boolean {
    return !!this.filter().trim() || this.#expanded().has(node.key);
  }
  blocked(node: TreeNode): boolean {
    return this.disabled() || this.index()?.entries.get(node.key)?.disabled === true;
  }
  checkState(node: TreeNode): 'checked' | 'unchecked' | 'indeterminate' {
    return (
      this.checks()?.get(node.key)?.state ??
      (this.selected().has(node.key) ? 'checked' : 'unchecked')
    );
  }
  expand(node: TreeNode, expanded: boolean): void {
    if (this.#syncingExpansion || this.disabled() || this.filter().trim()) return;
    const next = new Set(this.expandedKeys());
    if (expanded) next.add(node.key);
    else next.delete(node.key);
    this.expandedKeys.set([...next]);
  }
  select(node: TreeNode): void {
    const index = this.index();
    if (!index || !index.entries.has(node.key)) return;
    if (
      this.blocked(node) ||
      this.readonly() ||
      (this.leafOnly() && node.children?.length && !(this.multiple() && this.cascade()))
    )
      return;
    if (this.multiple()) {
      if (!this.validSelection()) return;
      if (this.cascade()) {
        const next = toggleTreeCascade(index, this.selectedKeys(), node.key, this.leafOnly());
        if (!next) {
          this.selectionLimited.set(treeCascadeKeys(index, node.key, this.leafOnly()).length > 0);
          return;
        }
        this.selectionLimited.set(false);
        this.selectedKeys.set(next);
      } else {
        const selection = new SelectionModel<TreeKey>(true, this.selectedKeys(), false);
        selection.toggle(node.key);
        if (!isTreeSelection(selection.selected)) {
          this.selectionLimited.set(true);
          return;
        }
        this.selectionLimited.set(false);
        this.selectedKeys.set(selection.selected);
      }
    }
    this.activeKey.set(node.key);
    this.activate.emit(node.key);
  }
}
