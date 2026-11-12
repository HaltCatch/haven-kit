import { SelectionModel } from '@angular/cdk/collections';
import { MatPseudoCheckbox } from '@angular/material/core';
import {
  ChangeDetectionStrategy,
  afterRenderEffect,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatTree, MatTreeModule } from '@angular/material/tree';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { HavenLocalization } from '@haven/ui';
import { HavenGlassSurface } from '@haven/ui/glass';
import { isTreeSelection } from '@haven/schema';
import type { RemoteTreeNode, TreeKey } from '@haven/schema';
import type { TreeDataSource } from '@haven/runtime';
import { injectTreeData } from './data';
import type { HavenTreeData } from './data';

/** Native Material navigation over a lazy cache. Accessors never initiate requests. */
@Component({
  selector: 'haven-remote-tree',
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
  styleUrls: ['../tree.scss', './tree.scss'],
})
export class HavenRemoteTree {
  readonly localization = inject(HavenLocalization);
  readonly source = input<TreeDataSource>();
  readonly data = input<HavenTreeData>();
  readonly active = input<() => boolean>(() => true);
  readonly title = input('');
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly filterable = input(false);
  readonly leafOnly = input(false);
  readonly selection = input(false);
  readonly multiple = input(false);
  readonly selectedKeys = model<TreeKey[]>([]);
  readonly activeKey = model<TreeKey | null>(null);
  readonly expandedKeys = model<readonly TreeKey[]>([]);
  readonly filter = model('');
  readonly activate = output<TreeKey>();
  readonly selectionLimited = signal(false);
  readonly #destroy = inject(DestroyRef);
  readonly #ownData = injectTreeData(
    () => (this.data() ? undefined : this.source()),
    () => !this.disabled() && this.active()(),
  );
  readonly controller = computed(() => this.data() ?? this.#ownData);
  readonly state = computed(() => this.controller().state());
  readonly validSelection = computed(() => isTreeSelection(this.selectedKeys()));
  readonly selected = computed(() => new Set(this.validSelection() ? this.selectedKeys() : []));
  readonly control = viewChild(MatTree<RemoteTreeNode, TreeKey>);
  #syncingExpansion = false;
  readonly view = computed(() => {
    const state = this.state(),
      text = this.filter().trim().toLocaleLowerCase();
    const children = new Map<TreeKey, RemoteTreeNode[]>();
    const visit = (nodes: readonly RemoteTreeNode[], matchingAncestor = false): RemoteTreeNode[] =>
      nodes.flatMap((node) => {
        const matches =
          matchingAncestor ||
          !text ||
          this.localization.text(node.label).toLocaleLowerCase().includes(text);
        const descendants = visit(state.branches.get(node.key)?.nodes ?? [], matches);
        children.set(node.key, descendants);
        return matches || descendants.length ? [node] : [];
      });
    return { roots: visit(state.branches.get(null)?.nodes ?? []), children };
  });
  readonly children = (node: RemoteTreeNode) => this.view().children.get(node.key) ?? [];
  readonly expansionKey = (node: RemoteTreeNode) => node.key;
  readonly track = (_: number, node: RemoteTreeNode) => node.key;

  constructor() {
    effect(() => {
      this.selectedKeys();
      this.multiple();
      this.selectionLimited.set(false);
    });
    effect(() => {
      const controller = this.controller();
      const current = this.current();
      untracked(() => {
        if (current) void controller.loader.load(null);
        else controller.loader.cancel(null, true);
      });
    });
    effect(() => {
      const controller = this.controller(),
        state = this.state(),
        expanded = this.expandedKeys();
      if (!this.current() || this.filter().trim()) return;
      untracked(() => {
        for (const key of expanded) {
          const entry = state.entries.get(key);
          if (
            entry?.node.hasChildren &&
            !entry.disabled &&
            !state.branches.has(key) &&
            entry.path.slice(0, -1).every((ancestor) => expanded.includes(ancestor))
          )
            void controller.loader.load(key);
        }
      });
    });
    // Cached roots may exist on the first frame. Wait until Material has bound its
    // accessor/expansion key and initialized native nodes before syncing expansion.
    afterRenderEffect({
      write: () => {
        const tree = this.control();
        this.view();
        this.expandedKeys();
        this.filter();
        if (!tree) return;
        untracked(() => {
          this.#syncingExpansion = true;
          try {
            for (const { node } of this.state().entries.values()) {
              if (!node.hasChildren) continue;
              if (this.expanded(node)) tree.expand(node);
              else tree.collapse(node);
            }
          } finally {
            this.#syncingExpansion = false;
          }
        });
      },
    });
    this.#destroy.onDestroy(() => this.controller().loader.cancel(null, true));
  }
  current(): boolean {
    return (
      !this.#destroy.destroyed && !this.disabled() && this.active()() && this.controller().current()
    );
  }
  expanded(node: RemoteTreeNode): boolean {
    return !!this.filter().trim() || this.expandedKeys().includes(node.key);
  }
  blocked(node: RemoteTreeNode): boolean {
    const entry = this.state().entries.get(node.key);
    return !this.current() || !entry || entry.node !== node || entry.disabled;
  }
  branch(key: TreeKey | null) {
    return this.state().branches.get(key);
  }
  expand(node: RemoteTreeNode, expanded: boolean): void {
    if (this.#syncingExpansion || this.blocked(node) || this.filter().trim()) return;
    const controller = this.controller(),
      next = new Set(this.expandedKeys());
    if (expanded) next.add(node.key);
    else next.delete(node.key);
    this.expandedKeys.set([...next]);
    if (!this.current() || this.controller() !== controller) return;
    if (expanded) void controller.loader.load(node.key);
    else controller.loader.cancel(node.key, true);
  }
  retry(key: TreeKey | null, event?: Event): void {
    event?.stopPropagation();
    if (!this.current() || (key !== null && this.state().entries.get(key)?.disabled)) return;
    void this.controller().loader.load(key);
  }
  select(node: RemoteTreeNode): void {
    if (this.blocked(node) || this.readonly() || (this.leafOnly() && node.hasChildren)) return;
    const controller = this.controller();
    if (this.multiple()) {
      if (!this.validSelection()) return;
      const selection = new SelectionModel<TreeKey>(true, this.selectedKeys(), false);
      selection.toggle(node.key);
      if (!isTreeSelection(selection.selected)) {
        this.selectionLimited.set(true);
        return;
      }
      this.selectionLimited.set(false);
      this.selectedKeys.set(selection.selected);
      if (!this.current() || this.controller() !== controller || this.readonly()) return;
    }
    this.activeKey.set(node.key);
    if (this.current() && this.controller() === controller && !this.readonly())
      this.activate.emit(node.key);
  }
  filterChanged(value: string): void {
    if (this.current()) this.filter.set(value.slice(0, 4096));
  }
}
