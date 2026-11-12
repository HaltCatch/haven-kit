import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  model,
  signal,
  untracked,
  viewChildren,
} from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';
import { MatSelect, MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { HavenGlassSurface } from '@haven/ui/glass';
import { HAVEN_THEME_CONTEXT, applyHavenTheme } from '@haven/ui/theme';
import { isTreeKey } from '@haven/schema';
import type { RemoteTreeNode, TreeKey } from '@haven/schema';
import type { TreeBranchState } from '@haven/runtime';
import { RemoteTreeField } from './field';

interface CascaderLevel {
  readonly parent: TreeKey | null;
  readonly options: readonly RemoteTreeNode[];
  readonly selected: TreeKey | undefined;
  readonly branch: TreeBranchState | undefined;
}

/** A branch is exploration; only an explicitly known leaf can replace the saved scalar value. */
@Component({
  selector: 'haven-remote-cascader-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    HavenGlassSurface,
  ],
  templateUrl: './cascader.html',
  styleUrl: '../fields.scss',
})
export class HavenRemoteCascaderField
  extends RemoteTreeField
  implements FormValueControl<TreeKey | null>
{
  readonly value = model<TreeKey | null>(null);
  readonly emptyValue = input<'' | null>(null);
  override readonly leafOnly = input(true);
  readonly multiple = false;
  readonly validValue = computed(
    () => this.value() === null || this.value() === '' || isTreeKey(this.value()),
  );
  readonly selectedKeys = computed(() =>
    this.value() === null || this.value() === '' ? [] : [this.value()!],
  );
  readonly filter = signal('');
  readonly path = linkedSignal({
    source: () => ({
      source: this.source(),
      identity: this.identity(),
      value: this.value(),
      selected: this.data.state().entries.get(this.value()!)?.path,
    }),
    computation: (current, previous): TreeKey[] => {
      if (
        previous &&
        previous.source.source?.identity === current.source?.identity &&
        previous.source.source?.adapter === current.source?.adapter &&
        previous.source.identity === current.identity &&
        previous.source.value === current.value &&
        previous.value.length
      )
        return previous.value;
      return [...(current.selected ?? [])];
    },
  });
  readonly levels = computed(() => {
    const state = this.data.state(),
      path = this.path(),
      levels: CascaderLevel[] = [];
    let parent: TreeKey | null = null;
    for (let at = 0; at < 32; at++) {
      const branch = state.branches.get(parent),
        selected = path[at],
        options = branch?.nodes ?? [];
      levels.push({ parent, branch, selected, options });
      const node = options.find((option) => option.key === selected);
      if (!node?.hasChildren) break;
      parent = node.key;
    }
    return levels;
  });
  override readonly display = computed(() => {
    const value = this.value();
    if (value === null || value === '') return '';
    const state = this.data.state(),
      path = state.entries.get(value)?.path;
    return (
      path?.map((key) => this.localization.text(state.entries.get(key)!.node.label)).join(' / ') ??
      String(value)
    );
  });
  readonly controls = viewChildren(MatSelect);
  readonly #opened = signal<MatSelect | undefined>(undefined);
  readonly #theme = inject(HAVEN_THEME_CONTEXT, { optional: true });
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly #destroy = inject(DestroyRef);
  protected override focusOverlay(): HTMLElement | undefined {
    const control = this.#opened();
    return control?.panelOpen
      ? (control.panel?.nativeElement as HTMLElement | undefined)
      : undefined;
  }
  constructor() {
    super();
    effect(() => {
      if (this.data.current()) untracked(() => void this.data.loader.load(null));
    });
    effect(() => {
      const state = this.data.state(),
        path = this.path();
      if (!this.data.current()) return;
      untracked(() => {
        for (const key of path) {
          const entry = state.entries.get(key);
          if (entry?.node.hasChildren && !entry.disabled && !state.branches.has(key))
            void this.data.loader.load(key);
        }
      });
    });
    effect((cleanup) => {
      const theme = this.#theme?.(),
        panel = this.focusOverlay();
      if (theme && panel) cleanup(applyHavenTheme(panel, theme));
    });
    effect(() => {
      if (this.blocked()) untracked(() => this.controls().forEach((control) => control.close()));
    });
  }
  opened(value: boolean, control: MatSelect): void {
    if (value && control.panelOpen) this.#opened.set(control);
    else if (this.#opened() === control) this.#opened.set(undefined);
  }
  blockedNode(node: RemoteTreeNode): boolean {
    return this.data.state().entries.get(node.key)?.disabled ?? true;
  }
  options(level: CascaderLevel): readonly RemoteTreeNode[] {
    const query = this.filter().trim().toLocaleLowerCase();
    return !query
      ? level.options
      : level.options.filter(
          (node) =>
            node.key === level.selected ||
            this.localization.text(node.label).toLocaleLowerCase().includes(query),
        );
  }
  private current(level: CascaderLevel): boolean {
    return (
      !this.#destroy.destroyed &&
      !this.blocked() &&
      this.data.current() &&
      this.levels().includes(level)
    );
  }
  select(level: CascaderLevel, key: TreeKey): void {
    if (!this.current(level)) return;
    const at = this.levels().indexOf(level),
      node = level.options.find((option) => option.key === key);
    if (!node || this.blockedNode(node)) return;
    const baseline = this.path(),
      owner = this.source(),
      identity = this.identity();
    const prior = baseline[at];
    if (prior !== undefined && prior !== key) this.data.loader.cancel(prior, true);
    if (
      this.#destroy.destroyed ||
      this.blocked() ||
      !this.data.current() ||
      this.path() !== baseline ||
      owner?.identity !== this.source()?.identity ||
      owner?.adapter !== this.source()?.adapter ||
      identity !== this.identity()
    )
      return;
    this.path.set([...baseline.slice(0, at), key]);
    if (!node.hasChildren) this.commit([key]);
    this.touch.emit();
  }
  retryBranch(level: CascaderLevel): void {
    if (this.current(level) && level.branch?.status === 'error')
      void this.data.loader.load(level.parent);
  }
  filterChanged(value: string): void {
    if (!this.blocked()) this.filter.set(value.slice(0, 4096));
  }
  commit(keys: readonly TreeKey[]): void {
    this.value.set(keys[0] ?? this.emptyValue());
  }
  override clear(): void {
    if (this.blocked() || this.#destroy.destroyed) return;
    const source = this.source(),
      identity = this.identity(),
      value = this.value();
    for (const key of this.path()) this.data.loader.cancel(key, true);
    if (
      this.blocked() ||
      source?.identity !== this.source()?.identity ||
      source?.adapter !== this.source()?.adapter ||
      identity !== this.identity() ||
      value !== this.value()
    )
      return;
    this.path.set([]);
    this.commit([]);
    this.touch.emit();
  }
  override focus(options?: FocusOptions): void {
    const control = this.controls().find((control) => !control.disabled);
    if (control) control.focus(options);
    else
      this.#element.nativeElement.querySelector<HTMLInputElement>('[data-display]')?.focus(options);
  }
}
