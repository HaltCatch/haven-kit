import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatMenu, MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatTreeNode } from '@angular/material/tree';
import { HavenLocalization } from '@haven/ui';
import { HAVEN_THEME_CONTEXT, applyHavenTheme } from '@haven/ui/theme';
import type { TreeNode, TreeMoveDirection, TreeEditorAction, TreeKey } from '@haven/schema';
import type { TreeEditorOwner, TreeEditorRequest } from './editor-owner';

interface RenameDraft {
  owner: TreeEditorOwner;
  key: TreeNode['key'];
  previousLabel: TreeNode['label'];
  locale: string;
}
@Component({
  selector: 'haven-tree-editor-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatInputModule, MatMenuModule, MatTooltipModule],
  templateUrl: './editor-row.html',
  styleUrl: './editor-row.scss',
})
export class HavenTreeEditorRow {
  readonly localization = inject(HavenLocalization);
  readonly node = input.required<TreeNode>();
  readonly owner = input.required<TreeEditorOwner>();
  readonly liveEdit = input.required<(owner: TreeEditorOwner, key: TreeKey) => boolean>();
  readonly liveIdle = input.required<(owner: TreeEditorOwner, key: TreeKey) => boolean>();
  readonly actions = input<readonly TreeEditorAction[]>([]);
  readonly blocked = input(false);
  readonly request = output<TreeEditorRequest>();
  readonly editing = signal<RenameDraft | undefined>(undefined);
  readonly draft = signal('');
  readonly renameError = signal(false);
  readonly active = computed(
    () => !this.blocked() && this.liveEdit()(this.owner(), this.node().key),
  );
  readonly idle = computed(() => this.active() && this.liveIdle()(this.owner(), this.node().key));
  readonly canRename = computed(() => this.active() && this.owner().settings.renamable !== false);
  readonly canMove = computed(
    () => this.idle() && this.owner().settings.movable !== false && !this.owner().filter.trim(),
  );
  readonly hasMenu = computed(
    () => this.canRename() || this.canMove() || this.actions().length > 0,
  );
  readonly renameInput = viewChild<ElementRef<HTMLInputElement>>('renameInput');
  readonly menuTrigger = viewChild(MatMenuTrigger);
  private readonly menu = viewChild(MatMenu);
  readonly #menuOwner = signal<TreeEditorOwner | undefined>(undefined);
  readonly #theme = inject(HAVEN_THEME_CONTEXT, { optional: true });
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly #treeNode = inject(MatTreeNode, { optional: true });
  readonly #destroy = inject(DestroyRef);
  constructor() {
    effect(() => {
      const owner = this.owner();
      this.node();
      this.blocked();
      untracked(() => {
        if (this.editing()?.owner !== owner || this.blocked()) this.cancelRename(false);
        if (this.#menuOwner() && (this.#menuOwner() !== owner || this.blocked()))
          this.menuTrigger()?.closeMenu();
      });
    });
    effect(() => {
      if (this.editing()) this.renameInput()?.nativeElement.focus();
    });
    effect((cleanup) => {
      const theme = this.#theme?.(),
        menu = this.menu();
      if (!theme || !menu || !this.#menuOwner()) return;
      const panel = this.#element.nativeElement.ownerDocument.getElementById(menu.panelId);
      if (panel) cleanup(applyHavenTheme(panel, theme));
    });
  }
  beginRename(): void {
    const current = this.editing();
    if (current) {
      if (current.owner === this.owner() && this.canRename() && !this.#destroy.destroyed)
        this.renameInput()?.nativeElement.focus();
      return;
    }
    if (!this.canRename() || !this.idle() || this.#destroy.destroyed) return;
    const node = this.node();
    this.editing.set({
      owner: this.owner(),
      key: node.key,
      previousLabel: structuredClone(node.label),
      locale: this.localization.locale(),
    });
    this.draft.set(this.localization.text(node.label));
    this.renameError.set(false);
    this.menuTrigger()?.closeMenu();
  }
  cancelRename(focus = true): void {
    if (!this.editing()) return;
    this.editing.set(undefined);
    this.renameError.set(false);
    if (focus && !this.#destroy.destroyed) this.#treeNode?.focus();
  }
  commitRename(): void {
    const session = this.editing(),
      label = this.draft();
    if (!session || session.owner !== this.owner() || !this.canRename() || this.#destroy.destroyed)
      return;
    if (!label.trim() || label.length > 4096) {
      this.renameError.set(true);
      return;
    }
    this.cancelRename();
    this.request.emit({
      owner: session.owner,
      proposal: {
        type: 'rename',
        key: session.key,
        label,
        previousLabel: session.previousLabel,
        locale: session.locale,
      },
    });
  }
  renameKey(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelRename();
    }
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      this.commitRename();
    }
  }
  context(event: MouseEvent): void {
    if (!this.idle() || !this.hasMenu()) return;
    event.preventDefault();
    event.stopPropagation();
    this.openMenu();
  }
  openMenu(): void {
    if (this.idle() && this.hasMenu()) this.menuTrigger()?.openMenu();
  }
  menuOpened(): void {
    this.#menuOwner.set(this.owner());
  }
  menuClosed(): void {
    const owner = this.#menuOwner();
    this.#menuOwner.set(undefined);
    queueMicrotask(() => {
      const document = this.#element.nativeElement.ownerDocument;
      if (
        !this.#destroy.destroyed &&
        owner === this.owner() &&
        !this.editing() &&
        document.activeElement === this.#element.nativeElement.querySelector('[data-tree-menu]')
      )
        this.#treeNode?.focus();
    });
  }
  menuRename(): void {
    const owner = this.#menuOwner();
    this.menuTrigger()?.closeMenu();
    if (owner && owner === this.owner()) this.beginRename();
  }
  move(direction: TreeMoveDirection): void {
    const owner = this.#menuOwner();
    this.menuTrigger()?.closeMenu();
    if (owner && owner === this.owner() && this.canMove() && !this.#destroy.destroyed)
      this.request.emit({ owner, key: this.node().key, direction });
  }
  runAction(id: string): void {
    const owner = this.#menuOwner(),
      key = this.node().key;
    this.menuTrigger()?.closeMenu();
    if (owner && owner === this.owner() && this.idle() && !this.#destroy.destroyed)
      this.request.emit({ owner, proposal: { type: 'action', key, action: id } });
  }
}
