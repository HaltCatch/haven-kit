import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChildren,
  inject,
  input,
  model,
} from '@angular/core';
import { MatExpansionModule } from '@angular/material/expansion';
import type { LocalizedText } from '@haven/schema';
import { HavenLocalization } from '@haven/ui';
import { HavenPanel } from '@haven/ui/page';

/** Stable panel IDs are public state; Material owns header focus, keyboard and expansion lifecycle. */
@Component({
  selector: 'haven-accordion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, MatExpansionModule],
  templateUrl: './accordion.html',
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .content {
      display: flex;
      flex-direction: column;
      gap: var(--haven-gap-md);
      padding-block-start: var(--haven-gap-md);
      overflow-wrap: anywhere;
    }
    [role='alert'] {
      color: var(--mat-sys-error);
    }
  `,
})
export class HavenAccordion {
  readonly localization = inject(HavenLocalization);
  readonly title = input<string | LocalizedText>('');
  readonly multi = input(false);
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly expandedIds = model<readonly string[]>([]);
  readonly panels = contentChildren(HavenPanel);
  readonly invalid = computed(() => {
    const ids = this.panels().map((panel) => panel.id()),
      expanded = this.expandedIds();
    return (
      ids.some((id) => !id) ||
      new Set(ids).size !== ids.length ||
      new Set(expanded).size !== expanded.length ||
      expanded.some((id) => !ids.includes(id)) ||
      (!this.multi() && expanded.length > 1)
    );
  });
  expand(id: string, expanded: boolean): void {
    const panel = this.panels().find((item) => item.id() === id);
    if (this.invalid() || this.disabled() || this.readonly() || !panel || panel.disabled()) return;
    const current = this.expandedIds();
    if (current.includes(id) === expanded) return;
    this.expandedIds.set(
      expanded ? (this.multi() ? [...current, id] : [id]) : current.filter((value) => value !== id),
    );
  }
}
