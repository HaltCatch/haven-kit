import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { HavenLocalization } from '@haven/ui';
import type { LocalTable } from '../features';

@Component({
  selector: 'haven-table-hierarchy-controls',
  imports: [MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<nav [attr.aria-label]="localization.message('table.hierarchy.controls')">
    <button
      matButton
      type="button"
      [disabled]="disabled() || !active()() || !table().getCanSomeRowsExpand() || allExpanded()"
      (click)="toggle(true)"
    >
      {{ localization.message('table.hierarchy.expandAll') }}
    </button>
    <button
      matButton
      type="button"
      [disabled]="disabled() || !active()() || !table().getIsSomeRowsExpanded()"
      (click)="toggle(false)"
    >
      {{ localization.message('table.hierarchy.collapseAll') }}
    </button>
  </nav>`,
  styles:
    ':host { display: block; } nav { display: flex; flex-wrap: wrap; gap: var(--haven-gap-sm); }',
})
export class HavenTableHierarchyControls {
  readonly table = input.required<LocalTable>();
  readonly owner = input.required<string>();
  readonly disabled = input(false);
  readonly active = input<() => boolean>(() => true);
  readonly toggled = output<{ owner: string; expanded: boolean }>();
  readonly localization = inject(HavenLocalization);
  // Native getIsAllRowsExpanded intentionally checks the current page; this control targets all rows.
  readonly allExpanded = computed(() => {
    const rows = this.table()
      .getCoreRowModel()
      .flatRows.filter((row) => row.getCanExpand());
    return rows.length > 0 && rows.every((row) => row.getIsExpanded());
  });
  toggle(expanded: boolean): void {
    if (!this.disabled() && this.active()()) this.toggled.emit({ owner: this.owner(), expanded });
  }
}
