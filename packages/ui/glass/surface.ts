import {
  APP_ID,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injectable,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { HAVEN_THEME_CONTEXT } from '@haven/ui/theme';
import { HAVEN_GLASS_CONFIG } from './config';
import { displacementMap, polarDisplacementMap, prominentDisplacementMap } from './maps';
import { ShaderDisplacementGenerator, fragmentShaders } from './shader';
import type { HavenGlassMode } from './config';

@Injectable({ providedIn: 'root' })
class GlassIdentity {
  readonly app = inject(APP_ID);
  next = 0;
  allocate(): string {
    return `${this.app}-haven-glass-${this.next++}`;
  }
}

/** Decorative material only. Projected inputs retain their native semantics and sharp text. */
@Component({
  selector: 'haven-glass-surface',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './surface.html',
  styleUrl: './surface.scss',
  host: {
    '[class.glass-enabled]': 'enabled()',
    '[class.glass-panel]': 'variant() === "panel"',
    '[attr.data-haven-glass]': 'enabled() ? mode() : null',
  },
})
export class HavenGlassSurface {
  readonly #defaults = inject(HAVEN_GLASS_CONFIG);
  readonly #theme = inject(HAVEN_THEME_CONTEXT, { optional: true });
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly #ready = signal(false);
  readonly id = inject(GlassIdentity).allocate();
  readonly active = input<boolean>();
  readonly variant = input<'control' | 'panel'>('control');
  readonly mode = input<HavenGlassMode>(this.#defaults.mode);
  readonly displacement = input(this.#defaults.displacement);
  readonly aberration = input(this.#defaults.aberration);
  readonly enabled = computed(() => this.active() ?? this.#theme?.().preset === 'liquid-glass');
  readonly size = signal({ width: 0, height: 0 });
  readonly strength = computed(() => Math.max(-100, Math.min(100, this.displacement())));
  readonly chroma = computed(() => Math.max(0, Math.min(4, this.aberration())));
  readonly map = computed(() => {
    if (!this.enabled() || this.variant() === 'panel') return displacementMap;
    if (this.mode() === 'polar') return polarDisplacementMap;
    if (this.mode() === 'prominent') return prominentDisplacementMap;
    const size = this.size();
    if (this.mode() !== 'shader' || !size.width || !size.height) return displacementMap;
    // Bounded raster work; generation follows element size, never pointer movement.
    const scale = Math.min(1, 256 / Math.max(size.width, size.height));
    const generator = new ShaderDisplacementGenerator({
      width: Math.max(1, Math.round(size.width * scale)),
      height: Math.max(1, Math.round(size.height * scale)),
      fragment: fragmentShaders.liquidGlass,
    });
    try {
      return generator.updateShader();
    } finally {
      generator.destroy();
    }
  });
  readonly filter = computed(() =>
    this.enabled() && this.variant() === 'control' ? `url(#${this.id})` : null,
  );
  constructor() {
    afterNextRender(() => this.#ready.set(true));
    effect((cleanup) => {
      if (
        !this.#ready() ||
        !this.enabled() ||
        this.variant() !== 'control' ||
        this.mode() !== 'shader'
      )
        return;
      const element = this.#host.nativeElement;
      let frame = 0;
      const observer = new ResizeObserver(([entry]) => {
        if (!entry) return;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          const width = Math.round(entry.contentRect.width),
            height = Math.round(entry.contentRect.height);
          if (width !== this.size().width || height !== this.size().height)
            this.size.set({ width, height });
        });
      });
      observer.observe(element);
      cleanup(() => {
        observer.disconnect();
        cancelAnimationFrame(frame);
      });
    });
  }
}
