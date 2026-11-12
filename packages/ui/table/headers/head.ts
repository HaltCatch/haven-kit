import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { HavenLocalization } from '@haven/ui';
import type { LocalColumn, LocalTable } from '../features';
import { tableHeaderRows } from './state';

/** Attribute component preserves native thead/tr/th semantics and native engine header spans. */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector -- A real thead host preserves native table semantics.
  selector: 'thead[havenTableHeaders]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule],
  templateUrl: './head.html',
  styleUrl: './head.scss',
  host: { '[class.sticky]': 'sticky()' },
})
export class HavenTableHeaders {
  readonly table = input.required<LocalTable>();
  readonly selectable = input(false);
  readonly hierarchical = input(false);
  readonly hasActions = input(false);
  readonly disabled = input(false);
  readonly selectionDisabled = input(false);
  readonly remote = input(false);
  readonly filteredSelected = input(0);
  readonly pinningPaused = input(false);
  readonly sticky = input(false);
  readonly sorted = output<LocalColumn>();
  readonly selectAll = output<boolean>();
  readonly localization = inject(HavenLocalization);
  readonly rows = computed(() => tableHeaderRows(this.table()));
  sort(column: LocalColumn): void {
    if (!this.disabled()) this.sorted.emit(column);
  }
  select(value: boolean): void {
    if (!this.selectionDisabled()) this.selectAll.emit(value);
  }
}
