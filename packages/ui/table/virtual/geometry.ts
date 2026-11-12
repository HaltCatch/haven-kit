import { afterRenderEffect, computed, inject, signal } from '@angular/core';
import { HavenLocalization } from '@haven/ui';
import { HAVEN_THEME_CONTEXT } from '@haven/ui/theme';
import type { HavenTableVirtualInputs } from './types';

interface Geometry {
  margin: number;
  padding: number;
  width: number;
  height: number;
  estimate: number;
  typography: string;
}
const pixels = (value: string) => Number.parseFloat(value) || 0;

/** Actual table flow origin includes caption and all header rows; sticky height is separate. */
export function observeTableVirtualGeometry(input: HavenTableVirtualInputs) {
  const theme = inject(HAVEN_THEME_CONTEXT, { optional: true }),
    locale = inject(HavenLocalization);
  const refresh = computed(() => [
    input.config(),
    input.measurementKey?.(),
    theme?.(),
    locale.locale(),
  ]);
  let currentRead: (() => void) | undefined;
  const epoch = signal(0),
    value = signal<Geometry>(
      { margin: 0, padding: 0, width: 0, height: 0, estimate: 48, typography: '' },
      {
        equal: (left, right) =>
          Object.keys(left).every(
            (key) => left[key as keyof Geometry] === right[key as keyof Geometry],
          ),
      },
    );
  afterRenderEffect({
    read: (cleanup) => {
      if (input.config() === undefined) return;
      refresh();
      const viewport = input.viewport()?.nativeElement,
        head = input.head()?.nativeElement,
        body = input.body()?.nativeElement;
      if (!viewport || !head || !body) return;
      const update = () => {
        const cell = body.querySelector<HTMLElement>('tr[data-virtual-row-id] td');
        const style = getComputedStyle(cell ?? viewport),
          rect = viewport.getBoundingClientRect();
        const font = pixels(style.fontSize) || 16,
          line = pixels(style.lineHeight) || font * 1.5;
        value.set({
          margin: Math.max(
            0,
            body.getBoundingClientRect().top - rect.top - viewport.clientTop + viewport.scrollTop,
          ),
          padding: Math.max(0, head.getBoundingClientRect().height),
          width: viewport.clientWidth || rect.width,
          height: viewport.clientHeight || rect.height,
          estimate: cell
            ? Math.max(
                1,
                line +
                  pixels(style.paddingTop) +
                  pixels(style.paddingBottom) +
                  pixels(style.borderTopWidth) +
                  pixels(style.borderBottomWidth),
              )
            : 48,
          typography: [
            style.fontFamily,
            style.fontSize,
            style.fontWeight,
            style.lineHeight,
            style.paddingTop,
            style.paddingBottom,
          ].join('|'),
        });
      };
      currentRead = update;
      cleanup(() => {
        if (currentRead === update) currentRead = undefined;
      });
      update();
      if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(update);
        for (const element of [viewport, head, body, head.parentElement?.querySelector('caption')])
          if (element) observer.observe(element);
        cleanup(() => observer.disconnect());
      }
      if (typeof MutationObserver !== 'undefined') {
        const observer = new MutationObserver(update);
        for (
          let ancestor: HTMLElement | null = viewport;
          ancestor;
          ancestor = ancestor.parentElement
        )
          observer.observe(ancestor, {
            attributes: true,
            attributeFilter: ['class', 'style', 'dir', 'data-haven-preset', 'data-haven-density'],
          });
        cleanup(() => observer.disconnect());
      }
      const fonts = viewport.ownerDocument.fonts;
      if (fonts) {
        const loaded = () => {
          update();
          epoch.update((current) => current + 1);
        };
        fonts.addEventListener('loadingdone', loaded);
        cleanup(() => fonts.removeEventListener('loadingdone', loaded));
      }
    },
  });
  return {
    value: value.asReadonly(),
    epoch: epoch.asReadonly(),
    refresh,
    read: () => currentRead?.(),
  };
}
