import { CdkScrollable } from '@angular/cdk/scrolling';
import { injectTableVirtualWindow } from './virtual/window';
import { HavenTableVirtualRow } from './virtual/row';
import { injectTableColumnFilters } from './filter-state';
import { createTableHierarchyState } from './hierarchy/state';
import { createTablePresentation } from './presentation/state';
import { tablePresentationStatus } from './presentation/status';
import { HavenTableHierarchyCell } from './hierarchy/cell';
import { HavenTableHierarchyControls } from './hierarchy/controls';
import { HavenTableHeaders } from './headers/head';
import { tableHeaderDefinitions, tableLeafDefinitions } from './headers/definitions';
import { HavenTableFilterPanel } from './filter-panel';
import type { HavenTableFilters } from './filters';
import type { TableColumnFilterValue, JsonValue } from '@haven/schema';
import { createRemoteTableEditState } from './remote-edit-state';
import { injectTableExport } from './export-controller';
import { HavenTableExportControls } from './export-controls';
import { HavenTableExtensions } from './table-extensions';
import { HavenTableEditorOutlet } from './editor-outlet';
import { HavenTableRowActions } from './row-actions';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  model,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { HavenGlassSurface } from '@haven/ui/glass';
import {
  isTableFilter,
  isTableHeaderLayout,
  isTableQuery,
  isTableSelection,
  isTableView,
  readPointer,
  tableRowId,
  validateTableData,
} from '@haven/schema';
import type {
  JsonObject,
  TableHeaderLayout,
  TableRowKey,
  TableView,
  TableQuery,
  TableVirtualization,
} from '@haven/schema';
import { injectTable } from '@tanstack/angular-table';
import type { ColumnDef, Updater } from '@tanstack/angular-table';
import { features } from './features';
import { injectRemoteTableData, mergeTableOptions } from './remote-data';
import { createTableQueryState } from './query-state';
import { bindLocalTableData } from './local-data';
import type { LocalColumn } from './features';
import { keyMap, selectionState, updateValue, viewState } from './view-state';
import { observeColumnWidth } from './width';
import { observeViewportWidth } from './viewport';
import { HavenTableToolbar } from './toolbar';
import { HAVEN_TABLE_CELL_RENDERERS, createHavenTableCellRenderers } from './cell-renderers';
import type { HavenTableCellRenderers } from './cell-renderers';
import { HavenTableCellOutlet } from './cell-outlet';
import { HavenTableCellSnapshots } from './cell-snapshots';

/** Local rows or a trusted remote adapter; all presentation state uses the native TanStack engine. */
@Component({
  selector: 'haven-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    HavenGlassSurface,
    CdkScrollable,
    HavenTableVirtualRow,
    HavenTableHeaders,
    HavenTableHierarchyCell,
    HavenTableHierarchyControls,
    HavenTableFilterPanel,
    HavenTableExportControls,
    MatButtonModule,
    HavenTableToolbar,
    HavenTableCellOutlet,
    HavenTableEditorOutlet,
    HavenTableRowActions,
    MatTooltipModule,
  ],
  providers: [HavenTableCellSnapshots],
  templateUrl: './table.html',
  styleUrl: './table.scss',
})
export class HavenTable extends HavenTableExtensions {
  readonly virtualization = input<TableVirtualization>();
  readonly presentation = createTablePresentation({
    config: this.virtualization,
    remote: () => !!this.source(),
    table: () => this.table,
    editingId: () => (this.editing.current() ? this.editing.session()?.id : undefined),
    anchorPage: (pageIndex) => this.anchorEditPage(pageIndex),
  });
  readonly exportable = input(false);
  readonly exportUnavailable = computed(
    () =>
      this.navigationDisabled() ||
      !!this.issue() ||
      (!!this.source() && this.dataState().status !== 'ready'),
  );
  readonly csv = injectTableExport({
    table: () => this.table,
    columns: () => this.visibleColumns(),
    models: () => this.columnModels(),
    rowKey: this.rowKey,
    remote: () => !!this.source(),
    unavailable: this.exportUnavailable,
    disabled: this.disabled,
    readonly: this.readonly,
    pagination: () => (this.presentation.collection() ? 'none' : 'pages'),
    selection: () => this.selection(),
    total: () =>
      this.source() ? this.dataState().total : this.table.getFilteredRowModel().flatRows.length,
  });
  readonly createCsv = this.csv.create;
  readonly downloadCsv = this.csv.download;
  readonly exportContext = this.csv.context;
  readonly expandedRowKeys = model<readonly TableRowKey[]>([]);
  readonly tree = createTableHierarchyState({
    table: () => this.table,
    rows: () => this.displayedRows(),
    rowKey: this.rowKey,
    hierarchy: this.hierarchy,
    owner: this.owner,
    remote: () => !!this.source(),
    blocked: this.navigationDisabled,
    active: () => this.hierarchyActive()(),
    editingKey: () => this.editing.session()?.rowKey,
    collection: this.presentation.collection,
    anchorPage: (pageIndex) => this.anchorEditPage(pageIndex),
    expanded: this.expandedRowKeys,
  });
  readonly pageSize = input(10);
  readonly title = input('');
  readonly headerGroups = input<TableHeaderLayout>();
  readonly #headerIssue = computed(
    () =>
      this.headerGroups() !== undefined &&
      !isTableHeaderLayout(this.headerGroups(), this.columns()),
  );
  readonly query = model<TableQuery>({ pageIndex: 0, pageSize: 10, sort: [], filter: '' });
  readonly filterable = input(false);
  readonly selectable = input(false);
  readonly columnMenu = input(false);
  readonly cellRenderers = input<HavenTableCellRenderers>();
  readonly #defaultCellRenderers = inject(HAVEN_TABLE_CELL_RENDERERS);
  readonly rendererRegistry = computed(() =>
    createHavenTableCellRenderers(this.cellRenderers() ?? this.#defaultCellRenderers),
  );
  readonly columnModels = computed(
    () => new Map(this.columns().map((column) => [column.id, column])),
  );
  readonly filters = input<HavenTableFilters>();
  /** The host may invalidate a retained filter draft before template inputs propagate. */
  readonly filterActive = input<() => boolean>(() => true);
  readonly columnFilters = model<readonly TableColumnFilterValue[]>([]);
  readonly activeColumnFilters = computed(() =>
    this.source() ? (this.query()?.columnFilters ?? []) : this.columnFilters(),
  );
  readonly columnFiltering = injectTableColumnFilters({
    columns: this.columns,
    registry: this.filters,
    values: this.activeColumnFilters,
    owner: this.owner,
    source: this.source,
    rows: () => this.displayedRows(),
    rowKey: this.rowKey,
    disabled: this.navigationDisabled,
    readonly: this.readonly,
    active: () => this.filterActive()(),
  });
  readonly filter = model('');
  readonly selection = model<readonly TableRowKey[]>([]);
  readonly view = model<TableView>({});
  readonly #queryState = createTableQueryState({
    source: this.source,
    query: this.query,
    filter: this.filter,
    columnFilters: this.columnFilters,
    columns: this.columns,
    disabled: this.navigationDisabled,
    filterable: this.filterable,
  });
  readonly #remote = injectRemoteTableData({
    source: this.source,
    query: this.query,
    columns: this.columns,
    rowKey: this.rowKey,
    locale: this.localization.locale,
    resetIdentity: () => {
      this.selection.set([]);
      this.#queryState.resetPage();
    },
  });
  readonly dataState = this.#remote.state;
  readonly displayedRows = computed(() => (this.source() ? this.dataState().rows : this.rows()));
  readonly #remoteEdits = createRemoteTableEditState({
    source: this.source,
    query: this.query,
    state: this.dataState,
    locale: this.localization.locale,
    columns: this.columns,
    reloadVersion: this.#remote.reloadVersion,
    reload: this.#remote.reload,
  });
  protected override editRows(): readonly JsonObject[] {
    return this.displayedRows();
  }
  protected override editScope(): unknown {
    return this.#remoteEdits.scope();
  }
  protected override editAvailable(): boolean {
    return this.#remoteEdits.available() && !this.tree.issue() && !this.presentation.issue();
  }
  readonly editRefreshFailed = this.#remoteEdits.refreshFailed;
  protected override afterEditCommitted(): void {
    this.#remoteEdits.committed();
  }
  readonly selectionDisabled = computed(
    () =>
      this.disabled() ||
      this.readonly() ||
      (!!this.source() && this.dataState().status !== 'ready'),
  );
  reload(): void {
    if (!this.disabled()) this.#remoteEdits.reload();
  }

  private readonly widthProbe = viewChild<ElementRef<HTMLElement>>('widthProbe');
  readonly #defaultWidth = observeColumnWidth(this.widthProbe);
  private readonly viewport = viewChild<ElementRef<HTMLElement>>('viewport');
  private readonly head = viewChild('head', { read: ElementRef<HTMLElement> });
  private readonly body = viewChild<ElementRef<HTMLElement>>('body');
  readonly #viewportWidth = observeViewportWidth(this.viewport);
  readonly #dataIssue = computed(() =>
    validateTableData(this.displayedRows(), this.columns(), this.rowKey()),
  );
  readonly #keys = computed(() =>
    this.#dataIssue()
      ? new Map<string, TableRowKey>()
      : keyMap(this.displayedRows(), this.rowKey()),
  );
  readonly issue = computed(() => {
    const data = this.#dataIssue();
    if (data) return data;
    if (this.tree.issue()) return { code: this.tree.issue()! };
    if (this.presentation.issue()) return { code: 'virtualization' };
    if (this.#headerIssue()) return { code: 'headerGroups' };
    const filtering = this.columnFiltering.issue();
    if (filtering) return { code: filtering };
    try {
      if (!this.source()) this.table.getFilteredRowModel();
    } catch {
      return { code: 'filterExecution' };
    }
    const unknown = this.columns().find(
      (column) => column.renderer && !this.rendererRegistry().has(column.renderer),
    );
    if (unknown) return { code: 'renderer', column: unknown.id, renderer: unknown.renderer };
    if (!isTableView(this.view(), this.columns())) return { code: 'view' };
    if (this.source() && !isTableQuery(this.query(), this.columns())) return { code: 'query' };
    if (!this.source() && !isTableFilter(this.filter())) return { code: 'filter' };
    if (
      !isTableSelection(this.selection()) ||
      (!this.source() && this.selection().some((key) => !this.#keys().has(`${typeof key}:${key}`)))
    )
      return { code: 'selection' };
    return null;
  });
  readonly #collator = computed(
    () => new Intl.Collator(this.localization.locale(), { numeric: true }),
  );
  readonly #definitions = computed<ColumnDef<typeof features, JsonObject>[]>(() => {
    if (this.#dataIssue()) return [];
    return tableLeafDefinitions(
      this.columns(),
      (value) => this.localization.text(value),
      this.#collator(),
      this.columnFiltering.definition,
    );
  });
  readonly #sizedDefinitions = computed(() => {
    const size = this.#defaultWidth();
    return this.#definitions().map((column) => ({ ...column, size }));
  });
  readonly #headerDefinitions = computed(() =>
    this.#dataIssue() || this.#headerIssue()
      ? []
      : tableHeaderDefinitions(this.headerGroups(), this.#sizedDefinitions(), (value) =>
          this.localization.text(value),
        ),
  );
  // Invalidate row/accessor caches when an existing column ID points at a new value.
  readonly #data = computed(() => {
    this.rowKey();
    this.#definitions();
    return this.#dataIssue() ? [] : [...this.tree.roots()];
  });
  readonly #viewState = computed(() =>
    viewState(isTableView(this.view(), this.columns()) ? this.view() : {}),
  );
  readonly #selectionState = computed(() =>
    isTableSelection(this.selection()) ? selectionState(this.selection()) : {},
  );
  readonly table = injectTable(() => ({
    features,
    data: this.#data(),
    columns: this.#headerDefinitions(),
    defaultColumn: { minSize: 48, maxSize: 1200 },
    getRowId: (row) => tableRowId(row, this.rowKey()),
    getSubRows: this.tree.children,
    enableExpanding: this.tree.enabled(),
    autoResetExpanded: false,
    paginateExpandedRows:
      this.presentation.collection() ||
      !this.hierarchy() ||
      this.hierarchy()?.pagination === 'visible-rows',
    filterFromLeafRows: this.hierarchy()?.filterMode !== 'prune-branches',
    onExpandedChange: this.tree.change,
    enableMultiSort: false,
    autoResetPageIndex: !this.source(),
    manualPagination: !!this.source() || this.presentation.collection(),
    mergeOptions: mergeTableOptions,
    ...(this.source() ? { rowCount: this.dataState().total ?? 0 } : {}),
    manualSorting: !!this.source(),
    manualFiltering: !!this.source(),
    onPaginationChange: (update) => {
      if (!this.navigationDisabled()) this.#queryState.pagination(update);
    },
    onSortingChange: (update) => {
      if (!this.navigationDisabled()) this.#queryState.sorting(update);
    },
    enableRowSelection: this.selectable() && !this.selectionDisabled(),
    enableSubRowSelection: this.tree.enabled(),
    getColumnCanGlobalFilter: () => true,
    globalFilterFn: (row, id, value: unknown) =>
      this.cell(row.getValue(id))
        .toLocaleLowerCase(this.localization.locale())
        .includes(String(value).toLocaleLowerCase(this.localization.locale())),
    state: {
      ...this.#viewState(),
      rowSelection: this.#selectionState(),
      expanded: this.tree.expanded(),
      ...this.#queryState.state(),
    },
    onGlobalFilterChange: this.#queryState.filter,
    onColumnFiltersChange: (update) => {
      if (this.filterActive()()) this.#queryState.columnFilters(update);
    },
    onRowSelectionChange: (update) => this.select(update),
    onColumnOrderChange: (update) =>
      this.patchView({ order: updateValue(update, this.#viewState().columnOrder) }),
    onColumnVisibilityChange: (update) =>
      this.patchView({
        hidden: Object.entries(updateValue(update, this.#viewState().columnVisibility))
          .filter(([, visible]) => !visible)
          .map(([id]) => id),
      }),
    onColumnPinningChange: (update) =>
      this.patchView({ pinned: updateValue(update, this.#viewState().columnPinning) }),
    onColumnSizingChange: (update) =>
      this.patchView({ widths: updateValue(update, this.#viewState().columnSizing) }),
  }));
  readonly virtualWindow = injectTableVirtualWindow({
    config: this.presentation.config,
    rows: () => this.table.getRowModel().rows,
    viewport: this.viewport,
    head: this.head,
    body: this.body,
    owner: this.owner,
    editingId: () => (this.editing.current() ? this.editing.session()?.id : undefined),
    active: () => !this.disabled() && this.hierarchyActive()(),
    measurementKey: () => [this.columns(), this.view(), this.rendererRegistry()],
  });
  readonly visibleColumns = computed(() => [
    ...this.table.getStartVisibleLeafColumns(),
    ...this.table.getCenterVisibleLeafColumns(),
    ...this.table.getEndVisibleLeafColumns(),
  ]);
  // Preserve the user's view while avoiding sticky groups that obscure each other or the center.
  readonly pinningPaused = computed(() => {
    const width = this.#viewportWidth();
    const pinned = this.visibleColumns().filter((column) => column.getIsPinned());
    if (width === null || pinned.length === 0) return false;
    const center = this.table.getCenterVisibleLeafColumns();
    // Center data can scroll: reserve its native minimum interaction width, not its full size.
    const reserve = center.length
      ? Math.min(...center.map((column) => column.columnDef.minSize ?? 48))
      : 0;
    return pinned.reduce((total, column) => total + column.getSize(), reserve) > width;
  });
  readonly pagination = computed(() => this.table.atoms.pagination.get());
  readonly pageCount = computed(() => Math.max(1, this.table.getPageCount()));
  readonly status = computed(() =>
    tablePresentationStatus(
      this.table,
      this.localization,
      this.presentation.collection(),
      this.tree.enabled() ? this.hierarchy() : undefined,
      !!this.source(),
      this.dataState().status,
      this.dataState().total,
    ),
  );
  private anchorEditPage(pageIndex: number): void {
    if (this.editing.current() && this.hierarchyActive()())
      this.#queryState.pagination((current) => ({ ...current, pageIndex }));
  }
  readonly editableVisibleIds = computed(() => this.visibleColumns().map((column) => column.id));
  readonly filteredSelected = computed(
    () => this.table.getFilteredSelectedRowModel().flatRows.length,
  );
  constructor() {
    super();
    this.presentation.bindPagination();
    bindLocalTableData({
      table: this.table,
      source: this.source,
      pageSize: this.pageSize,
      rows: this.rows,
      columns: this.columns,
      issue: this.#dataIssue,
      keys: this.#keys,
      rowKey: this.rowKey,
      selection: this.selection,
    });
  }
  private select(update: Updater<Record<string, true>>): void {
    if (this.selectionDisabled() || !this.selectable()) return;
    const next = updateValue(update, this.#selectionState()),
      keys = new Map([
        ...this.selection().map((key) => [`${typeof key}:${key}`, key] as const),
        ...this.#keys(),
      ]);
    this.selection.set(
      Object.keys(next)
        .filter((id) => next[id] && keys.has(id))
        .map((id) => keys.get(id)!),
    );
  }
  private patchView(patch: Partial<TableView>): void {
    if (this.navigationDisabled()) return;
    const next = { ...this.view(), ...patch };
    if (isTableView(next, this.columns())) this.view.set(next);
  }
  updateColumnFilter(columnId: string, value: JsonValue | undefined): void {
    if (!this.navigationDisabled()) this.table.getColumn(columnId)?.setFilterValue(value);
  }
  clearColumnFilters(): void {
    if (!this.navigationDisabled()) this.table.setColumnFilters([]);
  }
  sort(column: LocalColumn): void {
    if (!this.navigationDisabled()) column.toggleSorting();
  }
  selectAll(value: boolean): void {
    if (this.selectionDisabled()) return;
    if (this.source()) this.table.toggleAllPageRowsSelected(value);
    else this.table.toggleAllRowsSelected(value);
  }
  rowLabel(row: JsonObject): string {
    return this.localization.message('table.selectRow', { key: readPointer(row, this.rowKey()) });
  }
  cell(value: unknown): string {
    if (typeof value === 'number')
      return this.localization.number(value, { maximumSignificantDigits: 21 });
    if (typeof value === 'boolean')
      return this.localization.message(value ? 'table.true' : 'table.false');
    return typeof value === 'string' ? value : '';
  }
}
