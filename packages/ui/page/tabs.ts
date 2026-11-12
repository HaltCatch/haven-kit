import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  computed,
  contentChildren,
  effect,
  inject,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';
import { MatTabGroup, MatTabsModule } from '@angular/material/tabs';
import type { LocalizedText } from '@haven/schema';
import { HavenLocalization } from '@haven/ui';
import { HavenGlassSurface } from '@haven/ui/glass';
import { HavenPanel } from './tab';

/** Tab visibility does not change form policies. Mounted panel content remains alive. */
@Component({
  selector: 'haven-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, MatTabsModule, HavenGlassSurface],
  templateUrl: './tabs.html',
  styles: ':host { display: block; min-width: 0; } .panel { padding: var(--haven-gap-md); }',
})
export class HavenTabs {
  readonly localization = inject(HavenLocalization);
  readonly title = input<string | LocalizedText>('');
  readonly activeId = model<string | null>(null);
  readonly panels = contentChildren(HavenPanel);
  readonly control = viewChild(MatTabGroup);
  readonly #ready = signal(false);
  readonly selectedId = computed(() => {
    const panels = this.panels();
    return (
      (
        panels.find((panel) => panel.id() === this.activeId() && !panel.disabled()) ??
        panels.find((panel) => !panel.disabled())
      )?.id() ?? null
    );
  });
  readonly selectedIndex = computed(() =>
    Math.max(
      0,
      this.panels().findIndex((panel) => panel.id() === this.selectedId()),
    ),
  );
  constructor() {
    afterNextRender(() => this.#ready.set(true));
    effect(() => {
      if (this.#ready() && this.activeId() !== this.selectedId())
        this.activeId.set(this.selectedId());
    });
  }
  select(index: number): void {
    const panel = this.panels()[index];
    if (panel && !panel.disabled()) this.activeId.set(panel.id());
  }
  focus(): void {
    if (this.selectedId() !== null) this.control()?.focusTab(this.selectedIndex());
  }
}
