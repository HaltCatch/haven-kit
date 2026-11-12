import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { HavenLocalization } from '@haven/ui';
import type { Row } from '@tanstack/angular-table';
import { readPointer } from '@haven/schema';
import type { JsonObject } from '@haven/schema';
import type { features } from '../features';
import type { HierarchyToggle } from './state';

@Component({
  // eslint-disable-next-line @angular-eslint/component-selector -- Native td preserves the table's structure.
  selector: 'td[havenTableHierarchyCell]',
  imports: [MatButtonModule],
  host: {
    '[attr.aria-label]': "localization.message('table.hierarchy.level', {depth: row().depth + 1})",
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span
    class="indent"
    [style.padding-inline-start]="'calc(var(--haven-spacing) * ' + row().depth * 2 + ')'"
  >
    @if (row().getCanExpand()) {
      <button
        matIconButton
        type="button"
        [disabled]="disabled() || !active()()"
        [attr.aria-label]="label()"
        [attr.aria-expanded]="row().getIsExpanded()"
        (click)="toggle()"
      >
        <span class="marker" [class.collapsed]="!row().getIsExpanded()" aria-hidden="true">{{
          row().getIsExpanded() ? '▾' : '▸'
        }}</span>
      </button>
    } @else {
      <span class="leaf" aria-hidden="true"></span>
    }
  </span>`,
  styles: `
    :host {
      padding-inline: 0;
    }
    .indent {
      display: inline-flex;
      align-items: center;
    }
    .marker {
      display: inline-block;
    }
    :host-context([dir='rtl']) .collapsed {
      transform: rotate(180deg);
    }
    .leaf {
      display: inline-block;
      inline-size: calc(var(--haven-spacing) * 5);
    }
  `,
})
export class HavenTableHierarchyCell {
  readonly row = input.required<Row<typeof features, JsonObject>>();
  readonly owner = input.required<string>();
  readonly rowKey = input.required<string>();
  readonly disabled = input(false);
  readonly active = input<() => boolean>(() => true);
  readonly toggled = output<HierarchyToggle>();
  readonly localization = inject(HavenLocalization);
  label(): string {
    const key = readPointer(this.row().original, this.rowKey());
    const label = typeof key === 'number' ? this.localization.number(key) : String(key);
    return `${this.localization.message(this.row().getIsExpanded() ? 'table.hierarchy.collapseRow' : 'table.hierarchy.expandRow', { key: label })} · ${this.localization.message('table.hierarchy.level', { depth: this.row().depth + 1 })}`;
  }
  toggle(): void {
    if (!this.disabled() && this.active()())
      this.toggled.emit({ id: this.row().id, owner: this.owner() });
  }
}
