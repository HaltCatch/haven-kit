import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { Type } from '@angular/core';
import { HavenLocalization } from '@haven/ui';
import { HAVEN_THEME_CONTEXT } from '@haven/ui/theme';
import { readPointer } from '@haven/schema';
import type { JsonObject, TableColumn, TableRowKey } from '@haven/schema';
import type { HavenTableCellContext, HavenTableCellValue } from './cell-renderers';
import { HavenTableCellSnapshots } from './cell-snapshots';

const emptyParams: JsonObject = Object.freeze({});
/** Angular owns component creation/input delivery/destruction; no alternate component runtime. */
@Component({
  selector: 'haven-table-cell-outlet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `<ng-container
    [ngComponentOutlet]="component()"
    [ngComponentOutletInputs]="inputs()"
  />`,
  styles: ':host { display: block; min-width: 0; }',
})
export class HavenTableCellOutlet {
  readonly component = input.required<Type<unknown>>();
  readonly row = input.required<JsonObject>();
  readonly dataRevision = input.required<readonly JsonObject[]>();
  readonly columnRevision = input.required<readonly TableColumn[]>();
  readonly rowKeyPath = input.required<string>();
  readonly column = input.required<TableColumn>();
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly #localization = inject(HavenLocalization);
  readonly #theme = inject(HAVEN_THEME_CONTEXT, { optional: true });
  readonly #snapshots = inject(HavenTableCellSnapshots);
  readonly #row = computed(() => this.#snapshots.snapshot(this.row(), this.dataRevision()));
  readonly #params = computed(() =>
    this.#snapshots.snapshot(this.column().rendererParams ?? emptyParams, this.columnRevision()),
  );
  readonly #themeSnapshot = computed(() => {
    const theme = this.#theme?.();
    return theme ? this.#snapshots.snapshot(theme) : null;
  });
  readonly context = computed<HavenTableCellContext>(() =>
    Object.freeze({
      rowKey: readPointer(this.#row(), this.rowKeyPath()) as TableRowKey,
      row: this.#row(),
      columnId: this.column().id,
      value: readPointer(this.#row(), this.column().path) as HavenTableCellValue | undefined,
      params: this.#params(),
      locale: this.#localization.locale(),
      theme: this.#themeSnapshot(),
      disabled: this.disabled(),
      readonly: this.readonly(),
    }),
  );
  readonly inputs = computed(() => ({ context: this.context() }));
}
