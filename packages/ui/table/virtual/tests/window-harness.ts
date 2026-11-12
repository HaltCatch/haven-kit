import { Component, ElementRef, computed, signal, viewChild } from '@angular/core';
import { injectTable } from '@tanstack/angular-table';
import { tableRowId } from '@haven/schema';
import type { JsonObject, TableVirtualization } from '@haven/schema';
import { features } from '../../features';
import { injectTableVirtualWindow } from '../window';
import { HavenTableVirtualRow } from '../row';

@Component({
  imports: [HavenTableVirtualRow],
  template: `<div
    #viewport
    data-virtual-test-viewport
    style="height:180px;overflow:auto"
    (focusin)="window.focusIn($event)"
    (focusout)="window.focusOut($event)"
  >
    <table>
      <caption>
        Caption
      </caption>
      <thead #head>
        <tr>
          <th>Header</th>
        </tr>
      </thead>
      <tbody #body>
        @for (entry of window.entries(); track entry.key) {
          @if (entry.kind === 'spacer') {
            <tr aria-hidden="true">
              <td [style.height.px]="entry.height"></td>
            </tr>
          } @else {
            <tr
              [havenTableVirtualRow]="window"
              [virtualIndex]="entry.index"
              [virtualRowId]="entry.row.id"
              [attr.data-index]="entry.index"
              [attr.data-virtual-row-id]="entry.row.id"
            >
              <td style="padding:12px">
                <button>{{ entry.row.original['label'] }}</button>
              </td>
            </tr>
          }
        }
      </tbody>
    </table>
  </div>`,
})
export class VirtualWindowHarness {
  readonly config = signal<TableVirtualization | undefined>({ estimateRowHeight: 48, overscan: 2 });
  readonly owner = signal('first');
  readonly editing = signal<string | undefined>(undefined);
  readonly active = signal(true);
  readonly styleKey = signal(0);
  readonly source = signal<JsonObject[]>(
    Array.from({ length: 1000 }, (_, index) => ({
      key: index === 0 ? 0 : index === 1 ? '0' : `r${index}`,
      label: `Row ${index}`,
    })),
  );
  readonly viewport = viewChild<ElementRef<HTMLElement>>('viewport');
  readonly head = viewChild<ElementRef<HTMLElement>>('head');
  readonly body = viewChild<ElementRef<HTMLElement>>('body');
  readonly table = injectTable(() => ({
    features,
    data: this.source(),
    columns: [{ id: 'label', accessorKey: 'label' }],
    getRowId: (row) => tableRowId(row, '/key'),
    manualPagination: this.config() !== undefined,
    state: { pagination: { pageIndex: 0, pageSize: 10 } },
  }));
  readonly rows = computed(() => this.table.getRowModel().rows);
  readonly window = injectTableVirtualWindow({
    config: this.config,
    owner: this.owner,
    editingId: this.editing,
    active: this.active,
    viewport: this.viewport,
    head: this.head,
    body: this.body,
    rows: this.rows,
    measurementKey: () => [this.styleKey()],
  });
}
