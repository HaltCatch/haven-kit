import { afterNextRender, DestroyRef, inject, signal } from '@angular/core';
import type { ElementRef, Signal } from '@angular/core';

/** One theme-sized probe per table; the engine remains the sizing/offset owner. */
export function observeColumnWidth(
  probe: Signal<ElementRef<HTMLElement> | undefined>,
): Signal<number> {
  const width = signal(48);
  const destroyRef = inject(DestroyRef);
  afterNextRender({
    read: () => {
      const element = probe()?.nativeElement;
      if (!element) return;
      const measure = () => {
        const next = Math.round(element.getBoundingClientRect().width);
        if (Number.isFinite(next) && next >= 48 && next <= 1200 && next !== width())
          width.set(next);
      };
      measure();
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      destroyRef.onDestroy(() => observer.disconnect());
    },
  });
  return width.asReadonly();
}
