import type { CdkDragDrop } from '@angular/cdk/drag-drop';
import { treeMoveProposal } from '@haven/schema';
import type { TreeIndex, TreeKey, TreeMoveProposal } from '@haven/schema';
import type { TreeEditorOwner } from './editor-owner';

/** CDK owns drag transport. Stable keys and the drop row's bounds determine a pure proposal. */
export class TreeEditorDrag {
  #session: { owner: TreeEditorOwner; key: TreeKey; origin?: HTMLElement } | undefined;
  constructor(
    private readonly owner: () => TreeEditorOwner,
    private readonly index: () => TreeIndex | undefined,
    private readonly submit: (proposal: TreeMoveProposal, owner: TreeEditorOwner) => void,
  ) {}
  start(key: TreeKey, origin?: HTMLElement): void {
    this.cancel();
    this.#session = { owner: this.owner(), key, ...(origin ? { origin } : {}) };
    // Mark synchronously before CDK measures lists; Angular's next render is too late for geometry.
    origin?.classList.add('tree-drag-origin');
  }
  end(): void {
    const session = this.#session;
    // CDK's ended event precedes its dropped event in the same native cleanup turn.
    queueMicrotask(() => {
      if (this.#session === session) this.cancel();
    });
  }
  cancel(): void {
    this.#session?.origin?.classList.remove('tree-drag-origin');
    this.#session = undefined;
  }
  drop(event: CdkDragDrop<TreeKey, TreeKey, TreeKey>): void {
    const session = this.#session,
      owner = this.owner(),
      index = this.index();
    this.cancel();
    if (
      !session ||
      session.owner !== owner ||
      session.key !== event.item.data ||
      !event.isPointerOverContainer ||
      !index
    )
      return;
    const target = index.entries.get(event.container.data)?.node;
    if (!target) return;
    const bounds = event.container.element.nativeElement.getBoundingClientRect();
    if (bounds.height <= 0 || !Number.isFinite(event.dropPoint.y)) return;
    const fraction = (event.dropPoint.y - bounds.top) / bounds.height;
    const position =
      target.children !== undefined && fraction >= 0.25 && fraction <= 0.75
        ? 'inside'
        : fraction < 0.5
          ? 'before'
          : 'after';
    const proposal = treeMoveProposal(index, session.key, target.key, position);
    if (proposal) this.submit(proposal, owner);
  }
}
