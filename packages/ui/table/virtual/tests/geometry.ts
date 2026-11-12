import { vi } from 'vitest';

/** Synthetic API geometry only. Real sticky/layout/performance still require browser validation. */
export function installVirtualGeometry(
  options: {
    height?: number;
    width?: number;
    header?: number;
    caption?: number;
    row?: number;
  } = {},
) {
  let height = options.height ?? 180,
    width = options.width ?? 600;
  const header = options.header ?? 48,
    caption = options.caption ?? 24,
    rowHeight = options.row ?? 48;
  const heights = new WeakMap<Element, number>();
  const observers = new Set<MockResizeObserver>();
  class MockResizeObserver {
    readonly targets = new Map<Element, ResizeObserverOptions | undefined>();
    constructor(readonly callback: ResizeObserverCallback) {
      observers.add(this);
    }
    observe(element: Element, config?: ResizeObserverOptions) {
      this.targets.set(element, config);
    }
    unobserve(element: Element) {
      this.targets.delete(element);
    }
    disconnect() {
      this.targets.clear();
    }
  }
  const previousObserver = window.ResizeObserver;
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  window.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  const viewportOf = (element: Element) =>
    element.closest<HTMLElement>('[data-virtual-test-viewport],.scroll');
  const isViewport = (element: Element) => element.matches('[data-virtual-test-viewport],.scroll');
  const rowSize = (element: Element) => {
    if (element.matches('tr[aria-hidden="true"]')) {
      const td = element.querySelector<HTMLElement>('td');
      return Number.parseFloat(td?.style.height || (element as HTMLElement).style.height) || 0;
    }
    return heights.get(element) ?? rowHeight;
  };
  const bodySize = (element: Element) =>
    [...element.querySelectorAll('tr')].reduce((sum, row) => sum + rowSize(row), 0);
  const size = (element: HTMLElement) =>
    isViewport(element)
      ? height
      : element.tagName === 'THEAD'
        ? header
        : element.tagName === 'CAPTION'
          ? caption
          : element.tagName === 'TBODY'
            ? bodySize(element)
            : rowSize(element);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(() => width);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return size(this);
  });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return size(this);
  });
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return caption + header + bodySize(this.querySelector('tbody') ?? this);
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const viewport = viewportOf(this),
      scroll = viewport?.scrollTop ?? 0;
    const top =
      this.tagName === 'TBODY'
        ? caption + header - scroll
        : this.tagName === 'THEAD'
          ? Math.max(0, caption - scroll)
          : 0;
    const block = size(this);
    return {
      x: 0,
      y: top,
      top,
      left: 0,
      right: width,
      bottom: top + block,
      width,
      height: block,
      toJSON: () => ({}),
    } as DOMRect;
  });
  const scrollTo = function (this: HTMLElement, next: ScrollToOptions | number, y?: number) {
    const oldTop = this.scrollTop,
      oldLeft = this.scrollLeft;
    if (typeof next === 'number') {
      this.scrollLeft = next;
      if (y !== undefined) this.scrollTop = y;
    } else {
      if (next.top !== undefined) this.scrollTop = next.top;
      if (next.left !== undefined) this.scrollLeft = next.left;
    }
    if (oldTop !== this.scrollTop || oldLeft !== this.scrollLeft)
      this.dispatchEvent(new Event('scroll'));
  };
  const oldScroll = HTMLElement.prototype.scrollTo;
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    writable: true,
    value: scrollTo,
  });
  const notifyResize = (element: Element, blockSize?: number) => {
    if (blockSize !== undefined) heights.set(element, blockSize);
    for (const observer of observers)
      if (observer.targets.has(element)) {
        const box = { blockSize: blockSize ?? size(element as HTMLElement), inlineSize: width };
        observer.callback(
          [
            {
              target: element,
              borderBoxSize: [box],
              contentBoxSize: [box],
              devicePixelContentBoxSize: [box],
              contentRect: element.getBoundingClientRect(),
            } as ResizeObserverEntry,
          ],
          observer as unknown as ResizeObserver,
        );
      }
  };
  return {
    observers,
    notifyResize,
    setHeight: (next: number) => {
      height = next;
    },
    setWidth: (next: number) => {
      width = next;
    },
    restore: () => {
      window.ResizeObserver = previousObserver;
      Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
        configurable: true,
        writable: true,
        value: oldScroll,
      });
    },
  };
}
