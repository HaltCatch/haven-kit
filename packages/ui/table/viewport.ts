import { afterRenderEffect, signal } from '@angular/core';
import type { ElementRef, Signal } from '@angular/core';

/** Observe the actual scroll viewport, including recreation after a validation error. */
export function observeViewportWidth(
  viewport: Signal<ElementRef<HTMLElement> | undefined>,
): Signal<number | null> {
  const width = signal<number | null>(null);
  afterRenderEffect({
    read: (cleanup) => {
      const element = viewport()?.nativeElement;
      if (!element) {
        width.set(null);
        return;
      }
      const measure = () => width.set(element.clientWidth);
      measure();
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      cleanup(() => observer.disconnect());
    },
  });
  return width.asReadonly();
}
