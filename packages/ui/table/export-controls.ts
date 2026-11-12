import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { HavenLocalization } from '@haven/ui';
import type { HavenTableCsvResult, HavenTableExportScope } from './csv';
@Component({
  selector: 'haven-table-export-controls',
  imports: [MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav [attr.aria-label]="localization.message('table.export.label')">
      @if (remote()) {
        <button
          matButton
          type="button"
          [disabled]="disabled()"
          (click)="request.emit('loaded-page')"
        >
          {{ localization.message('table.export.loaded-page') }}
        </button>
      } @else {
        <button matButton type="button" [disabled]="disabled()" (click)="request.emit('filtered')">
          {{ localization.message('table.export.filtered') }}
        </button>
        <button matButton type="button" [disabled]="disabled()" (click)="request.emit('page')">
          {{ localization.message(collection() ? 'table.export.collection' : 'table.export.page') }}
        </button>
      }
    </nav>
    @if (result(); as current) {
      @if (current.status === 'error') {
        <p role="alert">{{ localization.message('table.export.error.' + current.code) }}</p>
      } @else {
        <p role="status">
          {{
            localization.message('table.export.complete', {
              count: localization.number(current.rowCount),
            })
          }}
        </p>
      }
    }
  `,
  styles:
    ':host { display: block; min-width: 0; } nav { display: flex; flex-wrap: wrap; gap: var(--haven-gap-sm); }',
})
export class HavenTableExportControls {
  readonly localization = inject(HavenLocalization);
  readonly remote = input(false);
  readonly collection = input(false);
  readonly disabled = input(false);
  readonly result = input<HavenTableCsvResult | null>(null);
  readonly request = output<HavenTableExportScope>();
}
