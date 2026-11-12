import { isTableColumnFilters } from '@haven/schema';
import type { TableColumnFilterValue } from '@haven/schema';
import { projectTableRows, tableBindingValue } from './table-data-projection';
import { bindTableEdits } from './table-edit-binding';
import { captureTableEditPort } from './table-edit-port';
import { tableFilterAdapter, tableFilterOwner } from './table-filter-owner';
import { EnvironmentInjector, effect, viewChild, untracked } from '@angular/core';
import { isTableRowActions, resolveSchema, schemaAtPointer } from '@haven/schema';
import type { HavenTableRowActionEvent } from '@haven/ui/table';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import type {
  JsonObject,
  JsonValue,
  TableQuery,
  TableHeaderLayout,
  TableHierarchy,
  TableVirtualization,
  TableRowKey,
  TableView,
  UiNode,
} from '@haven/schema';
import { isTableColumns, isTableView, readPointer } from '@haven/schema';
import type { TableDataSource } from '@haven/runtime';
import { HavenLocalization } from '@haven/ui';
import { HavenTable } from '@haven/ui/table';
import type { HavenRenderer } from './renderer';

/** A table's view/query/selection belong to its rendered instance, never to shared model data. */
@Component({
  selector: 'haven-table-node',
  imports: [HavenTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './table-node.html',
})
export class HavenTableNode {
  readonly node = input.required<UiNode>();
  readonly #injector = inject(EnvironmentInjector);
  readonly table = viewChild(HavenTable);
  readonly renderer = input.required<HavenRenderer>();
  readonly localization = inject(HavenLocalization);
  readonly state = computed(() => this.renderer().states().get(this.node().id)!);
  readonly resource = computed(() => this.node().props?.['resource']);
  readonly binding = computed(() => {
    const name = this.resource();
    return typeof name === 'string' ? this.renderer().document().resources[name] : undefined;
  });
  readonly owner = computed(() =>
    JSON.stringify([
      this.renderer().documentIdentity(),
      this.node().id,
      this.renderer().instances().contexts.get(this.node().id)?.source.bind,
      this.resource(),
      this.binding(),
      this.node().props?.['hierarchy'],
    ]),
  );
  readonly source = computed<TableDataSource | undefined>(() => {
    const binding = this.binding();
    const adapter =
      binding?.type === 'query' ? this.renderer().host().tables?.get(binding.adapter) : undefined;
    return adapter ? { identity: this.owner(), adapter } : undefined;
  });
  readonly filterActive = computed(() => {
    const renderer = this.renderer(),
      id = this.node().id,
      captured = tableFilterOwner(renderer, id),
      adapter = tableFilterAdapter(renderer, id),
      registry = renderer.host().tableFilters;
    return () => {
      const state = renderer.states().get(id);
      return (
        captured === tableFilterOwner(renderer, id) &&
        adapter === tableFilterAdapter(renderer, id) &&
        registry === renderer.host().tableFilters &&
        !!state?.visible &&
        !state.disabled &&
        renderer.validation().valid
      );
    };
  });
  readonly columns = computed(() => {
    const value = this.node().props?.['columns'];
    return isTableColumns(value) ? value : [];
  });
  readonly headerGroups = computed(
    () => this.node().props?.['headerGroups'] as TableHeaderLayout | undefined,
  );
  readonly hierarchy = computed(
    () => this.node().props?.['hierarchy'] as TableHierarchy | undefined,
  );
  readonly virtualization = computed(
    () => this.node().props?.['virtualization'] as TableVirtualization | undefined,
  );
  readonly expandedRowKeys = linkedSignal({
    source: () => JSON.stringify([this.owner(), this.node().props?.['expandedRowKeys'] ?? []]),
    computation: (identity, previous): readonly TableRowKey[] => {
      if (previous?.source === identity) return previous.value;
      return structuredClone(
        (this.node().props?.['expandedRowKeys'] as readonly TableRowKey[] | undefined) ?? [],
      );
    },
  });
  readonly hierarchyActive = computed(() => {
    const identity = this.owner(),
      hierarchy = JSON.stringify(this.hierarchy());
    return () => {
      const renderer = this.renderer(),
        current = renderer.states().get(this.node().id);
      return (
        identity === this.owner() &&
        hierarchy === JSON.stringify(current?.node.props?.['hierarchy']) &&
        !!current?.visible &&
        !current.disabled &&
        renderer.validation().valid
      );
    };
  });
  readonly boundRows = computed(() =>
    tableBindingValue(this.renderer().value(), this.node().bind ?? ''),
  );
  readonly projectedRows = computed(() =>
    this.source() ? [] : projectTableRows(this.boundRows()),
  );
  readonly rows = computed(() => this.projectedRows() ?? []);
  readonly pageSize = computed(() => {
    const value = this.node().props?.['pageSize'];
    return typeof value === 'number' ? value : 10;
  });
  readonly editMode = computed(() => {
    const mode = this.node().props?.['editMode'];
    return mode === 'cell' || mode === 'row' ? mode : undefined;
  });
  readonly itemSchema = computed(() => {
    const root = this.renderer().document().dataSchema,
      item = schemaAtPointer(root, this.node().bind ?? '')?.items;
    const schema = item && resolveSchema(item, root);
    return schema ? { ...schema, ...(root.$defs ? { $defs: root.$defs } : {}) } : undefined;
  });
  readonly #editDefinition = computed(() =>
    JSON.stringify([
      this.owner(),
      this.itemSchema(),
      this.columns().map((column) => [column.id, column.path, column.editor]),
      this.text('rowKey'),
    ]),
  );
  readonly editHandler = computed(() => {
    this.#editDefinition();
    return untracked(() => {
      const schema = this.itemSchema();
      return schema && !this.resource()
        ? bindTableEdits(
            this.renderer(),
            this.node,
            this.owner,
            this.#injector,
            schema,
            this.columns(),
            this.text('rowKey'),
          )
        : undefined;
    });
  });
  readonly #editPort = computed(() => captureTableEditPort(this.renderer(), this.node().id), {
    equal: (a, b) => a.key === b.key && a.handler === b.handler && a.reader === b.reader,
  });
  readonly remoteEditHandler = computed(() => this.#editPort().remoteHandler);
  readonly editActive = computed(() => this.#editPort().active);
  readonly rowActions = computed(() => {
    const value = this.node().props?.['rowActions'];
    return isTableRowActions(value) ? value : [];
  });
  constructor() {
    effect((cleanup) => {
      const table = this.table(),
        renderer = this.renderer();
      if (table)
        cleanup(
          renderer.registerPendingEdit(
            this.node().id,
            renderer.fieldIdentity(this.node()),
            table.pendingEdits,
          ),
        );
    });
    effect(() => {
      const scopes = new Set(
        (this.table()?.displayedRows() ?? []).flatMap((row) =>
          this.rowActions()
            .filter(
              (action) =>
                !this.state().disabled &&
                this.state().visible &&
                !(this.state().readonly && action.kind === 'write'),
            )
            .map((action) =>
              JSON.stringify([
                typeof readPointer(row, this.text('rowKey')),
                readPointer(row, this.text('rowKey')),
                action.id,
              ]),
            ),
        ),
      );
      this.renderer().actionDispatcher.retainScopes(this.node().id, scopes);
    });
  }
  committed(value: { rowKey: TableRowKey; row: JsonObject }): void {
    this.emit('editCommitted', { rowKey: value.rowKey, row: value.row });
  }
  invokeRow(value: HavenTableRowActionEvent): void {
    const action = this.rowActions().find((entry) => entry.id === value.actionId);
    if (!action || this.state().disabled || (this.state().readonly && action.kind === 'write'))
      return;
    this.renderer().dispatch(
      this.node(),
      'rowAction',
      { actionId: value.actionId, rowKey: value.rowKey, row: value.row },
      this.selection(),
      {
        ids: action.actions,
        key: JSON.stringify([typeof value.rowKey, value.rowKey, action.id]),
        active: () =>
          this.state().visible &&
          !this.state().disabled &&
          !(this.state().readonly && action.kind === 'write') &&
          !!this.table()
            ?.displayedRows()
            .some((row) => readPointer(row, this.text('rowKey')) === value.rowKey),
      },
    );
  }
  readonly selection = linkedSignal({
    source: this.owner,
    computation: () => [] as readonly TableRowKey[],
  });
  readonly filter = linkedSignal({ source: this.owner, computation: () => '' });
  readonly initialColumnFilters = computed(
    () => {
      const initial = this.node().props?.['columnFilters'];
      return isTableColumnFilters(initial, this.columns()) ? structuredClone(initial) : undefined;
    },
    { equal: (left, right) => JSON.stringify(left) === JSON.stringify(right) },
  );
  readonly columnFilters = linkedSignal({
    source: () => JSON.stringify([this.owner(), this.initialColumnFilters() ?? []]),
    computation: (): readonly TableColumnFilterValue[] =>
      structuredClone(this.initialColumnFilters() ?? []),
  });

  readonly #queryIdentity = computed(() =>
    JSON.stringify([this.owner(), this.pageSize(), this.initialColumnFilters() ?? []]),
  );
  readonly query = linkedSignal({
    source: this.#queryIdentity,
    computation: (): TableQuery => ({
      pageIndex: 0,
      pageSize: this.pageSize(),
      sort: [],
      filter: '',
      ...(this.initialColumnFilters() === undefined
        ? {}
        : { columnFilters: structuredClone(this.initialColumnFilters()!) }),
    }),
  });
  readonly view = linkedSignal({
    source: () =>
      JSON.stringify([
        this.owner(),
        this.columns().map((column) => column.id),
        this.node().props?.['view'] ?? {},
      ]),
    computation: (identity, previous): TableView => {
      // Inline source dependencies can change while this semantic identity stays equal.
      // Preserve user state instead of reapplying defaults after a cosmetic model edit.
      if (previous?.source === identity) return previous.value;
      const value = this.node().props?.['view'];
      return isTableView(value) ? structuredClone(value) : {};
    },
  });
  text(name: string): string {
    return this.localization.text(this.node().props?.[name]);
  }
  updateSelection(value: readonly TableRowKey[]): void {
    this.selection.set(value);
    this.emit('selectionChange', [...value]);
  }
  updateExpansion(value: readonly TableRowKey[]): void {
    const current = this.renderer().states().get(this.node().id);
    if (
      !current?.visible ||
      current.disabled ||
      !this.renderer().validation().valid ||
      this.table()?.owner() !== this.owner() ||
      JSON.stringify([
        current.node.props?.['hierarchy'],
        current.node.props?.['expandedRowKeys'],
      ]) !== JSON.stringify([this.hierarchy(), this.node().props?.['expandedRowKeys']])
    )
      return;
    this.expandedRowKeys.set(value);
    this.emit('expandedChange', [...value]);
  }
  updateColumnFilters(value: readonly TableColumnFilterValue[]): void {
    this.columnFilters.set(value);
    this.emit(
      'columnFiltersChange',
      value.map((filter) => ({ ...filter })),
    );
  }
  updateFilter(value: string): void {
    this.filter.set(value);
    this.emit('filterChange', value);
  }
  updateView(value: TableView): void {
    this.view.set(value);
    this.emit('viewChange', value);
  }
  updateQuery(value: TableQuery): void {
    const changedFilter = this.query().filter !== value.filter;
    this.query.set(value);
    if (changedFilter) this.emit('filterChange', value.filter);
    const { columnFilters, ...query } = value;
    this.emit('queryChange', {
      ...query,
      sort: value.sort.map((sort) => ({ ...sort })),
      ...(columnFilters ? { columnFilters: columnFilters.map((filter) => ({ ...filter })) } : {}),
    });
  }
  private emit(event: string, value: JsonValue): void {
    this.renderer().dispatch(this.node(), event, value, this.selection());
  }
}
