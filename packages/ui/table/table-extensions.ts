import {
  afterNextRender,
  computed,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  Injector,
  input,
  output,
} from '@angular/core';
import { HavenLocalization } from '@haven/ui';
import { HAVEN_THEME_CONTEXT } from '@haven/ui/theme';
import { fieldAt } from '@haven/ui/form-state';
import { isTableRowActions, readPointer, tableRowId } from '@haven/schema';
import type {
  DataSchema,
  JsonObject,
  TableColumn,
  TableHierarchy,
  TableRowAction,
  TableRowKey,
} from '@haven/schema';
import type { TableDataSource, TableEditHandler } from '@haven/runtime';
import { HAVEN_TABLE_EDITORS } from './editors';
import type { HavenTableEditors } from './editors';
import { HAVEN_TABLE_TOOLTIPS } from './tooltips';
import type { HavenTableTooltips } from './tooltips';
import { HavenTableCellSnapshots } from './cell-snapshots';
import type { HavenTableCellContext, HavenTableCellValue } from './cell-renderers';
import { injectTableEditing } from './edit-session';
export interface HavenTableRowActionEvent {
  readonly actionId: string;
  readonly rowKey: TableRowKey;
  readonly row: JsonObject;
}
/** Optional table extensions; the concrete component retains sole ownership of its TanStack engine. */
@Directive()
export abstract class HavenTableExtensions {
  readonly localization = inject(HavenLocalization);
  readonly rows = input<readonly JsonObject[]>([]);
  readonly columns = input<readonly TableColumn[]>([]);
  readonly rowKey = input('/id');
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly source = input<TableDataSource>();
  readonly owner = input('standalone');
  readonly hierarchy = input<TableHierarchy>();
  readonly hierarchyActive = input<() => boolean>(() => true);
  readonly editMode = input<'cell' | 'row'>();
  readonly itemSchema = input<DataSchema>();
  readonly editHandler = input<TableEditHandler>();
  /** Remote writes require a separately supplied port; local handlers are never reused implicitly. */
  readonly remoteEditHandler = input<TableEditHandler>();
  /** Reads live host permissions before delayed Angular inputs have propagated. */
  readonly editActive = input<() => boolean>(() => true);
  readonly editors = input<HavenTableEditors>();
  readonly tooltips = input<HavenTableTooltips>();
  readonly rowActions = input<readonly TableRowAction[]>([]);
  readonly editCommitted = output<{ rowKey: TableRowKey; row: JsonObject }>();
  readonly editCancelled = output<string>();
  readonly rowAction = output<HavenTableRowActionEvent>();
  readonly #defaultEditors = inject(HAVEN_TABLE_EDITORS);
  readonly #defaultTooltips = inject(HAVEN_TABLE_TOOLTIPS);
  readonly editorRegistry = computed(() => this.editors() ?? this.#defaultEditors);
  readonly tooltipRegistry = computed(() => this.tooltips() ?? this.#defaultTooltips);
  readonly #theme = inject(HAVEN_THEME_CONTEXT, { optional: true });
  readonly #snapshots = inject(HavenTableCellSnapshots);
  readonly #injector = inject(Injector);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly #destroy = inject(DestroyRef);
  #returnFocus: HTMLElement | null = null;
  #focusKey: { row: string; column: string } | undefined;
  readonly editing = injectTableEditing({
    owner: this.owner,
    rows: () => this.editRows(),
    columns: this.columns,
    rowKey: this.rowKey,
    schema: this.itemSchema,
    mode: this.editMode,
    hierarchy: this.hierarchy,
    remote: () => !!this.source(),
    scope: () => this.editScope(),
    available: () => this.editAvailable(),
    active: () => this.editActive()(),
    disabled: this.disabled,
    readonly: this.readonly,
    handler: () => (this.source() ? this.remoteEditHandler() : this.editHandler()),
    registry: this.editorRegistry,
    committed: (value) => {
      this.afterEditCommitted();
      this.editCommitted.emit(value);
    },
    cancelled: (reason) => {
      if (!this.#destroy.destroyed) this.editCancelled.emit(reason);
      this.restoreFocus();
    },
  });
  readonly pendingEdits = computed(
    () =>
      !!this.editing.session() &&
      !this.#destroy.destroyed &&
      !this.disabled() &&
      !this.readonly() &&
      this.editActive()(),
  );
  protected editRows(): readonly JsonObject[] {
    return this.rows();
  }
  protected editScope(): unknown {
    return undefined;
  }
  protected editAvailable(): boolean {
    return true;
  }
  protected afterEditCommitted(): void {}
  readonly navigationDisabled = computed(() => this.disabled() || !!this.editing.session());
  readonly hasActionColumn = computed(
    () => this.editMode() === 'row' || this.rowActions().length > 0,
  );
  readonly extensionIssue = computed(() => {
    if (!isTableRowActions(this.rowActions())) return 'actions';
    if (
      this.columns().some(
        (column) =>
          column.tooltip &&
          'provider' in column.tooltip &&
          !this.tooltipRegistry().has(column.tooltip.provider),
      )
    )
      return 'tooltip';
    return this.editing.problem();
  });
  startEdit(row: JsonObject, columnIds: readonly string[], event: Event): void {
    this.#returnFocus = event.currentTarget as HTMLElement;
    this.#focusKey = {
      row: tableRowId(row, this.rowKey()),
      column: this.#returnFocus.getAttribute('data-table-edit-column') ?? '',
    };
    this.editing.begin(row, columnIds);
    afterNextRender(
      () => {
        const session = this.editing.session(),
          column = session?.columns[0];
        if (session && column) fieldAt(session.native.tree, column.path)?.().focusBoundControl();
      },
      { injector: this.#injector },
    );
  }
  private restoreFocus(): void {
    if (this.#destroy.destroyed) return;
    afterNextRender(
      () => {
        const target = this.#returnFocus?.isConnected
          ? this.#returnFocus
          : [
              ...this.#element.nativeElement.querySelectorAll<HTMLElement>('[data-table-edit-row]'),
            ].find(
              (element) =>
                element.getAttribute('data-table-edit-row') === this.#focusKey?.row &&
                (element.getAttribute('data-table-edit-column') ?? '') === this.#focusKey?.column,
            );
        if (target?.isConnected) target.focus();
        else this.#element.nativeElement.querySelector<HTMLElement>('[role="region"]')?.focus();
        this.#returnFocus = null;
      },
      { injector: this.#injector },
    );
  }
  setParseError(path: string, invalid: boolean): void {
    this.editing.session()?.native.parse.update((value) => {
      const next = new Set(value);
      if (invalid) next.add(path);
      else next.delete(path);
      return next;
    });
  }
  editingColumn(rowId: string, columnId: string): boolean {
    const session = this.editing.session();
    return session?.id === rowId && session.columns.some((column) => column.id === columnId);
  }
  editKey(event: KeyboardEvent): void {
    if (!this.editing.session() || event.isComposing) return;
    const target = event.target as HTMLElement;
    if (!target.closest('haven-table-editor-outlet')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.editing.cancel();
    }
    if (event.key === 'Enter' && !target.closest('textarea,[role="combobox"],[role="listbox"]')) {
      event.preventDefault();
      void this.editing.save();
    }
  }
  invokeRow(action: TableRowAction, row: JsonObject): void {
    if (
      this.disabled() ||
      (this.readonly() && action.kind === 'write') ||
      this.editing.session() ||
      !isTableRowActions(this.rowActions()) ||
      !this.rowActions().some((entry) => entry.id === action.id)
    )
      return;
    this.rowAction.emit({
      actionId: action.id,
      rowKey: readPointer(row, this.rowKey()) as TableRowKey,
      row: structuredClone(row),
    });
  }
  tooltip(row: JsonObject, column: TableColumn): string {
    const tooltip = column.tooltip;
    if (!tooltip) return '';
    if ('text' in tooltip) return this.localization.text(tooltip.text);
    const provider = this.tooltipRegistry().get(tooltip.provider);
    if (!provider) return '';
    const theme = this.#theme?.(),
      snapshot = this.#snapshots.snapshot(row, this.rows());
    const context: HavenTableCellContext = Object.freeze({
      rowKey: readPointer(row, this.rowKey()) as TableRowKey,
      row: snapshot,
      columnId: column.id,
      value: readPointer(snapshot, column.path) as HavenTableCellValue | undefined,
      params: this.#snapshots.snapshot(tooltip.params ?? {}),
      locale: this.localization.locale(),
      theme: theme ? this.#snapshots.snapshot(theme) : null,
      disabled: this.disabled(),
      readonly: this.readonly(),
    });
    try {
      const value = provider(context);
      return typeof value === 'string' ? value.slice(0, 4096) : '';
    } catch {
      return this.localization.message('table.edit.tooltip');
    }
  }
}
