import { afterRenderEffect, DestroyRef, Directive, ElementRef, inject, input } from '@angular/core';
import type { HavenTableVirtualMeasurement } from './types';

/** Keeps the same native tr in paged/virtual modes; measurements never constrain its actual height. */
@Directive({ selector: 'tr[havenTableVirtualRow]' })
export class HavenTableVirtualRow {
  readonly havenTableVirtualRow = input.required<HavenTableVirtualMeasurement>();
  readonly virtualIndex = input.required<number>();
  readonly virtualRowId = input.required<string>();
  readonly #element = inject<ElementRef<HTMLTableRowElement>>(ElementRef);
  constructor() {
    afterRenderEffect(() => {
      this.virtualIndex();
      this.virtualRowId();
      const window = this.havenTableVirtualRow();
      if (window.enabled()) window.measure(this.#element.nativeElement);
    });
    inject(DestroyRef).onDestroy(() => this.havenTableVirtualRow().forget());
  }
}
