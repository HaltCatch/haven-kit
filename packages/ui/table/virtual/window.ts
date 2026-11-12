import {
  afterRenderEffect,
  computed,
  inject,
  linkedSignal,
  untracked,
  DestroyRef,
} from '@angular/core';
import { defaultRangeExtractor, injectVirtualizer } from '@tanstack/angular-virtual';
import type { Range } from '@tanstack/angular-virtual';
import { observeTableVirtualGeometry } from './geometry';
import { virtualTableEntries } from './entries';
import type { HavenTableBodyEntry, HavenTableVirtualInputs } from './types';

/** Windowing only: the table remains the sole row-model and edit-session owner. */
export function injectTableVirtualWindow(input: HavenTableVirtualInputs) {
  const destroy = inject(DestroyRef),
    geometry = observeTableVirtualGeometry(input);
  const enabled = computed(() => input.config() !== undefined);
  const focused = linkedSignal({ source: input.owner, computation: (): string | null => null });
  const positions = computed(() => new Map(input.rows().map((row, index) => [row.id, index])));
  const retained = computed(() =>
    [...new Set([input.editingId(), focused()])]
      .flatMap((key) =>
        key !== undefined && key !== null && positions().has(key) ? [positions().get(key)!] : [],
      )
      .slice(0, 2),
  );
  const itemKey = computed(() => {
    const rows = input.rows();
    return (index: number) => rows[index]!.id;
  });
  const extractor = computed(() => {
    const protectedIndexes = retained();
    return (range: Range) =>
      [...new Set([...defaultRangeExtractor(range), ...protectedIndexes])].sort((a, b) => a - b);
  });
  const virtualizer = injectVirtualizer<HTMLElement, HTMLTableRowElement>(() => ({
    enabled: enabled(),
    count: input.rows().length,
    scrollElement: input.viewport(),
    getItemKey: itemKey(),
    rangeExtractor: extractor(),
    estimateSize: () => input.config()?.estimateRowHeight ?? geometry.value().estimate,
    overscan: input.config()?.overscan ?? 5,
    scrollMargin: geometry.value().margin,
    scrollPaddingStart: geometry.value().padding,
    // Core owns frame cancellation; keep Angular's default DOM flush outside RO delivery.
    useAnimationFrameWithResizeObserver: true,
  }));
  const entries = computed<HavenTableBodyEntry[]>(() => {
    const rows = input.rows();
    if (!enabled()) return rows.map((row, index) => ({ kind: 'row', key: row.id, row, index }));
    const instance = virtualizer(),
      total = instance.getTotalSize(),
      items = virtualizer.getVirtualItems();
    const selected = new Map(items.map((item) => [item.index, item]));
    // Core does not call rangeExtractor for a zero-height viewport; retain at most the protected rows.
    for (const index of retained()) {
      const item = instance.measurementsCache[index];
      if (item && item.key === rows[index]?.id) selected.set(index, item);
    }
    return virtualTableEntries(rows, [...selected.values()], total, geometry.value().margin);
  });
  afterRenderEffect({
    read: () => {
      if (!enabled()) return;
      entries();
      // The first real row may mount after the initial zero-geometry render.
      untracked(() => geometry.read());
    },
  });
  const measure = (element: HTMLTableRowElement) => {
    if (destroy.destroyed || !enabled()) return;
    const index = Number(element.getAttribute('data-index')),
      id = element.getAttribute('data-virtual-row-id');
    if (Number.isInteger(index) && input.rows()[index]?.id === id)
      virtualizer.measureElement(element);
  };
  let cleanupQueued = false;
  const forget = () => {
    if (destroy.destroyed || cleanupQueued) return;
    cleanupQueued = true;
    queueMicrotask(() => {
      cleanupQueued = false;
      if (!destroy.destroyed) untracked(() => virtualizer.measureElement(null));
    });
  };
  const scrollToEditing = () => {
    if (!enabled() || !input.active() || destroy.destroyed) return;
    const id = input.editingId(),
      index = id === undefined ? undefined : positions().get(id);
    if (index !== undefined) virtualizer.scrollToIndex(index, { align: 'auto' });
  };
  let previousOwner: string | undefined,
    previousEnabled = false,
    previousIds: readonly string[] = [],
    previousContent = new Map<string, object>();
  afterRenderEffect(() => {
    const owner = input.owner(),
      on = enabled(),
      rows = input.rows(),
      editing = input.editingId();
    const ids = rows.map((row) => row.id),
      content = new Map(rows.map((row) => [row.id, row.original]));
    const orderChanged =
      ids.length !== previousIds.length || ids.some((id, index) => id !== previousIds[index]);
    const dataChanged = rows.some(
      (row) => previousContent.has(row.id) && previousContent.get(row.id) !== row.original,
    );
    const ownerChanged = previousOwner !== undefined && previousOwner !== owner;
    const entering = on && !previousEnabled;
    previousOwner = owner;
    previousEnabled = on;
    previousIds = ids;
    previousContent = content;
    if (!on) return;
    untracked(() => {
      if (ownerChanged || dataChanged) {
        virtualizer.measure();
        remeasure();
      }
      if (!input.active()) return;
      if (editing && (entering || orderChanged)) scrollToEditing();
      else if (!editing && (ownerChanged || orderChanged || entering))
        virtualizer.scrollToOffset(0);
    });
  });
  const remeasure = () => {
    for (const row of input
      .body()
      ?.nativeElement.querySelectorAll<HTMLTableRowElement>('tr[data-virtual-row-id]') ?? [])
      measure(row);
  };
  const measuredStyle = computed(() => {
    const value = geometry.value();
    return `${value.width}|${value.estimate}|${value.typography}`;
  });
  afterRenderEffect(() => {
    if (!enabled()) return;
    geometry.refresh();
    measuredStyle();
    geometry.epoch();
    untracked(() => {
      virtualizer.measure();
      remeasure();
    });
  });
  const focusedRow = (target: EventTarget | null): string | null => {
    if (!(target instanceof Element)) return null;
    const row = target.closest<HTMLTableRowElement>('tr[data-virtual-row-id]');
    const id = row?.getAttribute('data-virtual-row-id');
    return row && input.viewport()?.nativeElement.contains(row) && id && positions().has(id)
      ? id
      : null;
  };
  return {
    enabled,
    entries,
    virtualizer,
    measure,
    forget,
    scrollToEditing,
    focusIn: (event: FocusEvent) => focused.set(focusedRow(event.target)),
    focusOut: (event: FocusEvent) => {
      const owner = input.owner(),
        document =
          event.target instanceof Element
            ? event.target.ownerDocument
            : input.viewport()?.nativeElement.ownerDocument;
      queueMicrotask(() => {
        if (!destroy.destroyed && input.owner() === owner)
          focused.set(focusedRow(document?.activeElement ?? null));
      });
    },
  };
}
