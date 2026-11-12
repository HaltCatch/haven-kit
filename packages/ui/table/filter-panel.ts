import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { HavenLocalization } from '@haven/ui';
import { inject } from '@angular/core';
import type { JsonValue, TableColumn, TableColumnFilterValue } from '@haven/schema';
import type { HavenTableFilters } from './filters';
import { HavenTableFilterCard } from './filter-card';
@Component({
  selector: 'haven-table-filter-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, HavenTableFilterCard],
  templateUrl: './filter-panel.html',
  styles:
    ':host { display:block; min-width:0; } .filters { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr)); gap:var(--haven-gap-md); padding:var(--haven-gap-sm); }',
})
export class HavenTableFilterPanel {
  readonly localization = inject(HavenLocalization);
  readonly columns = input.required<readonly TableColumn[]>();
  readonly registry = input.required<HavenTableFilters>();
  readonly values = input.required<readonly TableColumnFilterValue[]>();
  readonly owner = input('standalone');
  readonly active = input<() => boolean>(() => true);
  readonly disabled = input(false);
  readonly unsupportedRemote = input(false);
  readonly changed = output<{ columnId: string; value: JsonValue | undefined }>();
  readonly clearAll = output<void>();
  readonly expanded = signal(false);
  readonly configured = computed(() => this.columns().filter((column) => column.filter));
  value(column: TableColumn): JsonValue | undefined {
    return this.values().find((entry) => entry.columnId === column.id)?.value;
  }
  change(columnId: string, value: JsonValue | undefined): void {
    if (!this.disabled() && this.active()()) this.changed.emit({ columnId, value });
  }
}
