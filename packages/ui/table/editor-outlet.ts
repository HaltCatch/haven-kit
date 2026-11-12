import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { fieldAt } from '@haven/ui/form-state';
import { HavenLocalization } from '@haven/ui';
import { HAVEN_THEME_CONTEXT } from '@haven/ui/theme';
import { readPointer, schemaAtPointer } from '@haven/schema';
import type { DataSchema, JsonObject, TableColumn, TableRowKey } from '@haven/schema';
import type { FieldTree } from '@angular/forms/signals';
import { HavenTableCellSnapshots } from './cell-snapshots';
import type { HavenTableCellValue } from './cell-renderers';
import type { HavenTableEditorContext, HavenTableEditorRegistration } from './editors';
@Component({
  selector: 'haven-table-editor-outlet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `<ng-container
    [ngComponentOutlet]="registration().component"
    [ngComponentOutletInputs]="inputs()"
  />`,
  styles: ':host { display: block; min-width: 0; }',
})
export class HavenTableEditorOutlet {
  readonly registration = input.required<HavenTableEditorRegistration>();
  readonly row = input.required<JsonObject>();
  readonly rowKey = input.required<TableRowKey>();
  readonly column = input.required<TableColumn>();
  readonly schema = input.required<DataSchema>();
  readonly tree = input.required<FieldTree<Record<string, unknown>>>();
  readonly parseInvalid = output<boolean>();
  readonly reportParse = (invalid: boolean) => this.parseInvalid.emit(invalid);
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly #locale = inject(HavenLocalization);
  readonly #theme = inject(HAVEN_THEME_CONTEXT, { optional: true });
  readonly #snapshot = inject(HavenTableCellSnapshots);
  readonly context = computed<HavenTableEditorContext>(() => {
    const column = this.column(),
      row = this.#snapshot.snapshot(this.row()),
      theme = this.#theme?.();
    return Object.freeze({
      rowKey: this.rowKey(),
      row,
      columnId: column.id,
      value: readPointer(row, column.path) as HavenTableCellValue | undefined,
      params: this.#snapshot.snapshot(column.editor?.params ?? {}),
      locale: this.#locale.locale(),
      theme: theme ? this.#snapshot.snapshot(theme) : null,
      disabled: this.disabled(),
      readonly: this.readonly(),
      editorId: column.editor!.id,
      label: this.#locale.text(column.header),
      schema: this.#snapshot.snapshot(schemaAtPointer(this.schema(), column.path)!),
    });
  });
  readonly inputs = computed(() => ({
    context: this.context(),
    field: fieldAt(this.tree(), this.column().path),
    ...(this.column().editor && ['date', 'time', 'datetime'].includes(this.column().editor!.id)
      ? { parseError: this.reportParse }
      : {}),
  }));
}
