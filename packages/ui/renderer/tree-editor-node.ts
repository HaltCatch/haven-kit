import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  viewChild,
} from '@angular/core';
import { HavenTreeEditor } from '@haven/ui/tree';
import {
  indexTree,
  isTreeEditorActions,
  isTreeNodes,
  isTreeSelection,
  treeEditIssue,
} from '@haven/schema';
import type { JsonValue, TreeEditProposal, TreeKey, UiNode } from '@haven/schema';
import type { HavenRenderer } from './renderer';
import { treeEditorView } from './tree-editor-view';

/** A proposal bridge, never a second editor or an implicit model mutation service. */
@Component({
  selector: 'haven-tree-editor-node',
  imports: [HavenTreeEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<haven-tree-editor
    #editor
    [nodes]="nodes()"
    [title]="title()"
    [identity]="view.identity()"
    [readonly]="state()?.readonly ?? true"
    [disabled]="state()?.disabled ?? true"
    [movable]="props()?.['movable'] !== false"
    [renamable]="props()?.['renamable'] !== false"
    [fixedKeys]="fixedKeys()"
    [actions]="actions()"
    [filterable]="props()?.['filterable'] === true"
    [activeKey]="view.active()"
    [expandedKeys]="view.expanded()"
    [filter]="view.filter()"
    (expandedKeysChange)="expand(editor, $event)"
    (activeKeyChange)="select(editor, $event)"
    (filterChange)="search(editor, $event)"
    (activate)="emit(editor, 'activate', $event)"
    (proposal)="propose(editor, $event)"
  />`,
})
export class HavenTreeEditorNode {
  readonly node = input.required<UiNode>();
  readonly renderer = input.required<HavenRenderer>();
  readonly state = computed(() => this.renderer().states().get(this.node().id));
  readonly props = computed(() => this.state()?.node.props);
  readonly identity = computed(() => this.renderer().fieldIdentity(this.node()));
  readonly nodes = computed(() => {
    const nodes = this.props()?.['nodes'];
    return isTreeNodes(nodes) ? nodes : [];
  });
  readonly title = computed(() => this.renderer().localization.text(this.props()?.['title']));
  readonly fixedKeys = computed(() => {
    const keys = this.props()?.['fixedKeys'];
    return isTreeSelection(keys) ? keys : [];
  });
  readonly actions = computed(() => {
    const actions = this.props()?.['actions'];
    return isTreeEditorActions(actions) ? actions : [];
  });
  readonly view = treeEditorView(this.identity, this.props);
  readonly control = viewChild(HavenTreeEditor);
  constructor() {
    effect((cleanup) => {
      const control = this.control();
      if (!control) return;
      cleanup(
        this.renderer().registerPendingEdit(this.node().id, this.identity(), () =>
          this.#current(control) && !this.state()?.readonly ? control.pendingEdits() : false,
        ),
      );
    });
  }
  #current(control: HavenTreeEditor): boolean {
    const state = this.state();
    return (
      state?.node.kind === 'tree.editor' &&
      state.visible &&
      !state.disabled &&
      this.renderer().validation().valid &&
      control.identity() === this.view.identity() &&
      control.nodes() === this.nodes()
    );
  }
  emit(control: HavenTreeEditor, event: string, value: JsonValue): void {
    if (this.#current(control)) this.renderer().dispatch(this.state()!.node, event, value);
  }
  select(control: HavenTreeEditor, key: TreeKey | null): void {
    if (this.view.restoring()) return;
    if (this.#current(control) && !this.view.controlled('selection')) this.view.select(key);
    else this.view.restore(() => control.activeKey.set(this.view.active()));
  }
  expand(control: HavenTreeEditor, keys: readonly TreeKey[]): void {
    if (this.view.restoring()) return;
    const current = this.#current(control);
    if (current && !this.view.controlled('expandedKeys')) this.view.expand(keys);
    else this.view.restore(() => control.expandedKeys.set(this.view.expanded()));
    if (current) this.emit(control, 'expandedChange', [...keys]);
  }
  search(control: HavenTreeEditor, query: string): void {
    if (this.view.restoring()) return;
    const current = this.#current(control);
    if (current && !this.view.controlled('filter')) this.view.search(query);
    else this.view.restore(() => control.filter.set(this.view.filter()));
    if (current) this.emit(control, 'filterChange', query);
  }
  propose(control: HavenTreeEditor, proposal: TreeEditProposal): void {
    if (!this.#current(control) || this.state()?.readonly) return;
    const props = this.props();
    if (
      treeEditIssue(indexTree(this.nodes()), proposal, {
        movable: props?.['movable'] !== false,
        renamable: props?.['renamable'] !== false,
        fixedKeys: this.fixedKeys(),
        actions: this.actions(),
      }) !== null
    )
      return;
    this.emit(control, 'proposal', proposal);
  }
}
