import {
  columnFilteringFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createExpandedRowModel,
  rowExpandingFeature,
  createPaginatedRowModel,
  createSortedRowModel,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
} from '@tanstack/angular-table';
import type { Column, Table } from '@tanstack/angular-table';
import type { JsonObject } from '@haven/schema';

export const features = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  rowSelectionFeature,
  rowSortingFeature,
  rowPaginationFeature,
  rowExpandingFeature,
  expandedRowModel: createExpandedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
});
export type LocalTable = Table<typeof features, JsonObject>;
export type LocalColumn = Column<typeof features, JsonObject>;
