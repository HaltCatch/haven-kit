import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelect, MatSelectModule } from '@angular/material/select';
import { HAVEN_THEME_CONTEXT, applyHavenTheme } from '@haven/ui/theme';
import { MatButtonModule } from '@angular/material/button';
import { HavenLocalization } from '@haven/ui';
import type { LocalColumn, LocalTable } from './features';

@Component({
  selector: 'haven-table-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './toolbar.html',
  styleUrl: './toolbar.scss',
})
export class HavenTableToolbar {
  readonly localization = inject(HavenLocalization);
  readonly table = input.required<LocalTable>();
  readonly filterable = input(false);
  readonly remote = input(false);
  readonly columnMenu = input(false);
  readonly disabled = input(false);
  readonly expanded = signal(false);
  readonly #theme = inject(HAVEN_THEME_CONTEXT, { optional: true });
  readonly #openedSelect = signal<MatSelect | null>(null);
  constructor() {
    effect((cleanup) => {
      const theme = this.#theme?.();
      const panel = this.#openedSelect()?.panel?.nativeElement as HTMLElement | undefined;
      if (theme && panel) cleanup(applyHavenTheme(panel, theme));
    });
  }
  opened(control: MatSelect, open: boolean): void {
    if (open) this.#openedSelect.set(control);
    else if (this.#openedSelect() === control) this.#openedSelect.set(null);
  }
  readonly columns = computed(() => [
    ...this.table().getStartLeafColumns(),
    ...this.table().getCenterLeafColumns(),
    ...this.table().getEndLeafColumns(),
  ]);
  filter(value: string): void {
    if (!this.disabled()) this.table().setGlobalFilter(value);
  }
  private siblings(column: LocalColumn): LocalColumn[] {
    const region = column.getIsPinned();
    return this.columns().filter((item) => item.getIsPinned() === region);
  }
  canMove(column: LocalColumn, offset: number): boolean {
    const siblings = this.siblings(column),
      target = siblings.findIndex((item) => item.id === column.id) + offset;
    return target >= 0 && target < siblings.length;
  }
  move(column: LocalColumn, offset: number): void {
    if (this.disabled() || !this.canMove(column, offset)) return;
    const ids = this.siblings(column).map((item) => item.id),
      index = ids.indexOf(column.id),
      target = index + offset;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    const region = column.getIsPinned();
    if (region) this.table().setColumnPinning((current) => ({ ...current, [region]: ids }));
    else this.table().setColumnOrder(ids);
  }
  pin(column: LocalColumn, value: string): void {
    if (!this.disabled() && (value === '' || value === 'start' || value === 'end'))
      column.pin(value || false);
  }
  visible(column: LocalColumn, value: boolean): void {
    if (!this.disabled() && (value || this.table().getVisibleLeafColumns().length > 1))
      column.toggleVisibility(value);
  }
  width(column: LocalColumn, value: number): void {
    if (!this.disabled() && Number.isInteger(value) && value >= 48 && value <= 1200)
      this.table().setColumnSizing((current) => ({ ...current, [column.id]: value }));
  }
}
