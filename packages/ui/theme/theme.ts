import { Directive, ElementRef, InjectionToken, effect, inject, input } from '@angular/core';
import type { Signal } from '@angular/core';
import type { HavenTheme } from '@haven/schema';
import { applyHavenTheme } from './apply-theme';
export const HAVEN_THEME_CONTEXT = new InjectionToken<Signal<HavenTheme>>('Haven theme context');
@Directive({
  selector: '[havenTheme]',
  providers: [
    { provide: HAVEN_THEME_CONTEXT, useFactory: () => inject(HavenThemeDirective).havenTheme },
  ],
})
export class HavenThemeDirective {
  readonly havenTheme = input.required<HavenTheme>();
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef);
  constructor() {
    effect((onCleanup) =>
      onCleanup(applyHavenTheme(this.#element.nativeElement, this.havenTheme())),
    );
  }
}
