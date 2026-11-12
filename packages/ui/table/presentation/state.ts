import { computed, effect, untracked } from '@angular/core';
import { isTableVirtualization } from '@haven/schema';
import type { TableVirtualization } from '@haven/schema';
import type { LocalTable } from '../features';

interface Inputs {
  config(): TableVirtualization | undefined;
  remote(): boolean;
  table(): LocalTable;
  editingId(): string | undefined;
  anchorPage(pageIndex: number): void;
}
/** Presentation only: query and write-session ownership remain independent of windowing. */
export function createTablePresentation(input: Inputs) {
  const issue = computed(
    () => input.config() !== undefined && !isTableVirtualization(input.config()),
  );
  const config = computed(() => (issue() ? undefined : input.config()));
  const enabled = computed(() => config() !== undefined);
  const collection = computed(() => enabled() && !input.remote());
  let wasCollection = false;
  // Bind after injectTable: its options-update effect must apply the new native pagination mode first.
  const bindPagination = () =>
    effect(() => {
      const current = collection(),
        previous = wasCollection;
      wasCollection = current;
      if (!previous || current || input.remote()) return;
      const id = input.editingId();
      if (!id) return;
      const table = input.table(),
        row = table.getCoreRowModel().rowsById[id];
      if (!row) return;
      // Root-row pagination slices roots before native expansion; visible-row pagination slices leaves too.
      const anchor = table.options.paginateExpandedRows ? row : (row.getParentRows()[0] ?? row),
        position = table
          .getPrePaginatedRowModel()
          .rows.findIndex((entry) => entry.id === anchor.id),
        page = Math.floor(position / table.atoms.pagination.get().pageSize);
      if (position >= 0) untracked(() => input.anchorPage(page));
    });
  return { issue, config, enabled, collection, bindPagination };
}
