import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import type { HavenTableCellContext } from '@haven/ui/table';

@Component({
  selector: 'haven-fixture-note-cell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div data-fixture="custom-cell" [attr.data-row-key]="context().rowKey">
    <span>{{ context().value }}</span>
    <button
      type="button"
      [disabled]="context().disabled"
      [attr.aria-expanded]="grown()"
      (click)="grown.set(!grown())"
    >
      {{ grown() ? 'Shrink row' : 'Grow row' }}
    </button>
    @if (grown()) {
      <p data-fixture="grown-content">{{ extra }}</p>
    }
  </div>`,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    button {
      display: block;
      margin-block-start: var(--haven-gap-sm);
    }
    p {
      margin-block: var(--haven-gap-md);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
  `,
})
export class FixtureNoteCell {
  readonly context = input.required<HavenTableCellContext>();
  readonly grown = signal(false);
  readonly extra = Array.from(
    { length: 6 },
    (_, line) =>
      `Additional synthetic paragraph ${line + 1}. Natural content height must remain measurable as the viewport, theme, direction and column widths change.`,
  ).join('\n\n');
}
