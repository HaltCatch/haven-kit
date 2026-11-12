import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { HavenLocalization } from '@haven/ui';
import type { TableRowAction } from '@haven/schema';
@Component({
  selector: 'haven-table-row-actions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule],
  template: `@for (action of actions(); track action.id) {
    <button
      matButton
      type="button"
      [disabled]="disabled() || (readonly() && action.kind === 'write')"
      (click)="run(action)"
    >
      {{ localization.text(action.label) }}
    </button>
  }`,
  styles: ':host { display: flex; flex-wrap: wrap; gap: var(--haven-gap-xs); }',
})
export class HavenTableRowActions {
  readonly actions = input<readonly TableRowAction[]>([]);
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly invoked = output<TableRowAction>();
  readonly localization = inject(HavenLocalization);
  run(action: TableRowAction): void {
    if (!this.disabled() && !(this.readonly() && action.kind === 'write'))
      this.invoked.emit(action);
  }
}
