import {
  ChangeDetectionStrategy,
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
  viewChildren,
} from '@angular/core';
import { Directionality } from '@angular/cdk/bidi';
import { CdkScrollable } from '@angular/cdk/scrolling';
import {
  CdkDrag,
  CdkDragHandle,
  CdkDragPreview,
  CdkDropList,
  CdkDropListGroup,
} from '@angular/cdk/drag-drop';
import type { CdkDragStart } from '@angular/cdk/drag-drop';
import { MatTree, MatTreeModule } from '@angular/material/tree';
import { MatTooltip, MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { HavenGlassSurface } from '@haven/ui/glass';
import { HavenLocalization } from '@haven/ui';
import { filterTree, indexTree, treeEditIssue, treeKeyboardMove } from '@haven/schema';
import type {
  TreeEditIssue,
  TreeEditProposal,
  TreeEditorAction,
  TreeEditorSettings,
  TreeKey,
  TreeMoveDirection,
  TreeNode,
} from '@haven/schema';
import { HavenTreeEditorRow } from './editor-row';
import { HavenTreeDragHint } from './editor-drag-hint';
import { TreeEditorDrag } from './editor-drag';
import { isTreeEditorOwnerSettings, sameTreeEditorOwner } from './editor-owner';
import type { TreeEditorOwner, TreeEditorRequest } from './editor-owner';

/** Controlled editing: only proposals leave this component; the host remains the data/permission owner. */
@Component({
  selector: 'haven-tree-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CdkScrollable,
    MatTreeModule,
    MatButtonModule,
    MatTooltipModule,
    MatFormFieldModule,
    MatInputModule,
    HavenGlassSurface,
    HavenTreeEditorRow,
    HavenTreeDragHint,
    CdkDrag,
    CdkDragHandle,
    CdkDragPreview,
    CdkDropList,
    CdkDropListGroup,
  ],
  templateUrl: './tree-editor.html',
  styleUrl: './tree-editor.scss',
})
export class HavenTreeEditor {
  readonly localization = inject(HavenLocalization);
  readonly nodes = input<readonly TreeNode[]>([]);
  readonly title = input('');
  readonly identity = input('');
  readonly readonly = input(false);
  readonly disabled = input(false);
  readonly movable = input(true);
  readonly renamable = input(true);
  readonly fixedKeys = input<readonly TreeKey[]>([]);
  readonly actions = input<readonly TreeEditorAction[]>([]);
  readonly filterable = input(false);
  readonly activeKey = model<TreeKey | null>(null);
  readonly expandedKeys = model<readonly TreeKey[]>([]);
  readonly filter = model('');
  readonly proposal = output<TreeEditProposal>();
  readonly activate = output<TreeKey>();
  readonly issue = signal<TreeEditIssue | null>(null);
  readonly index = computed(() => indexTree(this.nodes()));
  readonly settings = computed<Required<TreeEditorSettings>>(() => ({
    readonly: this.readonly(),
    disabled: this.disabled(),
    movable: this.movable(),
    renamable: this.renamable(),
    fixedKeys: this.fixedKeys(),
    actions: this.actions(),
  }));
  readonly owner = computed<TreeEditorOwner>(
    () => ({
      nodes: this.nodes(),
      identity: this.identity(),
      filter: this.filter(),
      settings: this.settings(),
    }),
    { equal: sameTreeEditorOwner },
  );
  readonly valid = computed(() => {
    const index = this.index(),
      settings = this.settings();
    return (
      !!index &&
      isTreeEditorOwnerSettings(settings) &&
      this.fixedKeys().every((key) => index.entries.has(key))
    );
  });
  readonly filtered = computed(() => {
    const index = this.index();
    return index && this.valid()
      ? [...filterTree(index, this.filter(), (node) => this.localization.text(node.label))]
      : [];
  });
  readonly control = viewChild(MatTree<TreeNode, TreeKey>);
  readonly rows = viewChildren(HavenTreeEditorRow);
  private readonly hints = viewChildren(MatTooltip);
  readonly editActive = (owner: TreeEditorOwner, key: TreeKey): boolean => {
    const node = this.index()?.entries.get(key)?.node;
    return (
      !this.#destroy.destroyed &&
      this.valid() &&
      owner === this.owner() &&
      !!node &&
      !this.editBlocked(node)
    );
  };
  readonly #pendingKeys = computed(() => {
    const owner = this.owner();
    return this.valid()
      ? this.rows().flatMap((row) => {
          const draft = row.editing();
          return draft && draft.owner === owner && this.editActive(owner, draft.key)
            ? [draft.key]
            : [];
        })
      : [];
  });
  readonly pendingEdits = computed(() => this.#pendingKeys().length > 0);
  readonly editIdle = (owner: TreeEditorOwner, key: TreeKey): boolean =>
    this.editActive(owner, key) && !this.pendingEdits();
  readonly drag = new TreeEditorDrag(this.owner, this.index, (proposal, owner) =>
    this.request({ owner, proposal }),
  );
  readonly #direction = inject(Directionality, { optional: true });
  readonly #destroy = inject(DestroyRef);
  #syncing = false;
  constructor() {
    this.#destroy.onDestroy(() => this.drag.cancel());
    effect(() => {
      this.owner();
      this.drag.cancel();
      this.issue.set(null);
    });
    effect(() => {
      const tree = this.control(),
        index = this.index();
      this.filtered();
      this.expandedKeys();
      this.filter();
      if (!tree || !index) return;
      untracked(() => {
        this.#syncing = true;
        try {
          for (const { node } of index.entries.values())
            if (node.children?.length) {
              if (this.expanded(node)) tree.expand(node);
              else tree.collapse(node);
            }
        } finally {
          this.#syncing = false;
        }
      });
    });
  }
  readonly children = (node: TreeNode) => node.children ?? [];
  readonly expansionKey = (node: TreeNode) => node.key;
  readonly track = (_: number, node: TreeNode) => node.key;
  filterInput(input: HTMLInputElement): void {
    if (!this.disabled() && !this.pendingEdits() && !this.#destroy.destroyed)
      this.filter.set(input.value);
    // A controlled host can synchronously decline the value; the native input already changed.
    input.value = this.filter();
  }
  expanded(node: TreeNode): boolean {
    return !!this.filter().trim() || this.expandedKeys().includes(node.key);
  }
  blocked(node: TreeNode): boolean {
    return this.disabled() || this.index()?.entries.get(node.key)?.disabled === true;
  }
  editBlocked(node: TreeNode): boolean {
    return this.blocked(node) || this.readonly() || this.fixedKeys().includes(node.key);
  }
  startDrag(event: CdkDragStart<TreeKey>): void {
    this.drag.start(event.source.data, event.source.dropContainer.element.nativeElement);
    // A hovered hint can otherwise cover the next row and intercept CDK's native hit test.
    for (const hint of this.hints()) hint.hide(0);
  }
  canDrag(node: TreeNode): boolean {
    return (
      this.movable() && !this.pendingEdits() && !this.filter().trim() && !this.editBlocked(node)
    );
  }
  canCollapse(node: TreeNode): boolean {
    return !this.#pendingKeys().some(
      (key) => key !== node.key && this.index()?.entries.get(key)?.path.includes(node.key),
    );
  }
  expand(node: TreeNode, expanded: boolean): void {
    if (this.#syncing || this.blocked(node)) return;
    if (!expanded && (this.filter().trim() || !this.canCollapse(node))) {
      this.#syncing = true;
      try {
        this.control()?.expand(node);
      } finally {
        this.#syncing = false;
      }
      return;
    }
    if (this.filter().trim()) return;
    const keys = new Set(this.expandedKeys());
    if (expanded) keys.add(node.key);
    else keys.delete(node.key);
    this.expandedKeys.set([...keys]);
  }
  select(node: TreeNode): void {
    if (
      this.blocked(node) ||
      this.#destroy.destroyed ||
      (this.pendingEdits() && !this.#pendingKeys().includes(node.key))
    )
      return;
    const owner = this.owner();
    this.activeKey.set(node.key);
    if (this.owner() === owner && !this.#destroy.destroyed) this.activate.emit(node.key);
  }
  request(request: TreeEditorRequest): void {
    if (this.#destroy.destroyed) return;
    if (this.pendingEdits()) {
      this.issue.set('blocked');
      return;
    }
    if (request.owner !== this.owner()) {
      this.issue.set('stale');
      return;
    }
    const index = this.index(),
      proposal =
        'proposal' in request
          ? request.proposal
          : index
            ? treeKeyboardMove(index, request.key, request.direction)
            : undefined;
    if (!proposal) {
      this.issue.set('position');
      return;
    }
    if (proposal.type === 'move' && this.filter().trim()) {
      this.issue.set('filtered');
      return;
    }
    const issue = treeEditIssue(index, proposal, this.owner().settings);
    this.issue.set(issue === 'unchanged' ? null : issue);
    if (issue === null) this.proposal.emit(structuredClone(proposal));
  }
  key(event: KeyboardEvent, node: TreeNode): void {
    if (event.target !== event.currentTarget) return;
    const row = this.rows().find((row) => row.node().key === node.key);
    if (event.key === 'F2' && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      event.stopPropagation();
      row?.beginRename();
      return;
    }
    if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      event.preventDefault();
      event.stopPropagation();
      row?.openMenu();
      return;
    }
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const rtl = this.#direction?.value === 'rtl';
    const direction: TreeMoveDirection | undefined =
      event.key === 'ArrowUp'
        ? 'up'
        : event.key === 'ArrowDown'
          ? 'down'
          : event.key === 'ArrowRight'
            ? rtl
              ? 'outdent'
              : 'indent'
            : event.key === 'ArrowLeft'
              ? rtl
                ? 'indent'
                : 'outdent'
              : undefined;
    if (direction) {
      event.preventDefault();
      event.stopPropagation();
      this.request({ owner: this.owner(), key: node.key, direction });
    }
  }
}
