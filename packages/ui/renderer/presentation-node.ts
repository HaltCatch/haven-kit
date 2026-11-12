import { HavenToolbar } from '@haven/ui/actions';
import type { HavenToolbarAlignment, HavenToolbarGap } from '@haven/ui/actions';
import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  TemplateRef,
  computed,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import type { JsonValue, UiNode } from '@haven/schema';
import { HavenLocalization } from '@haven/ui';
import { HavenPanel } from '@haven/ui/page';
import {
  HavenAccordion,
  HavenAlert,
  HavenBadge,
  HavenCard,
  HavenDivider,
  HavenProgress,
} from '@haven/ui/display';
import type { HavenDisplayTone } from '@haven/ui/display';

/** Private model adapter. Child recursion belongs to the host-provided template, avoiding renderer cycles. */
@Component({
  selector: 'haven-presentation-node',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    HavenToolbar,
    NgTemplateOutlet,
    HavenPanel,
    HavenAccordion,
    HavenAlert,
    HavenBadge,
    HavenCard,
    HavenDivider,
    HavenProgress,
  ],
  templateUrl: './presentation-node.html',
  styles: ':host { display: block; min-width: 0; }',
})
export class HavenPresentationNode {
  readonly localization = inject(HavenLocalization);
  readonly node = input.required<UiNode>();
  readonly boundValue = input<JsonValue | undefined>();
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly identity = input('');
  readonly visibleChildren = input<readonly UiNode[]>([]);
  readonly childTemplate = input.required<TemplateRef<{ $implicit: UiNode }>>();
  readonly event = output<{ event: string; value?: JsonValue }>();
  readonly toolbarAlign = computed<HavenToolbarAlignment>(() => {
    const align = this.node().props?.['align'];
    return align === 'center' || align === 'end' || align === 'space-between' ? align : 'start';
  });
  readonly toolbarGap = computed<HavenToolbarGap>(() => {
    const gap = this.node().props?.['gap'];
    return gap === 'none' || gap === 'xs' || gap === 'md' || gap === 'lg' || gap === 'xl'
      ? gap
      : 'sm';
  });
  readonly appearance = computed(() => {
    const value = this.node().props?.['appearance'];
    return value === 'raised' || value === 'filled' ? value : 'outlined';
  });
  readonly tone = computed<HavenDisplayTone>(() => {
    const value = this.node().props?.['tone'];
    return value === 'neutral' ||
      value === 'info' ||
      value === 'success' ||
      value === 'warning' ||
      value === 'error'
      ? value
      : this.node().kind === 'view.alert'
        ? 'info'
        : 'neutral';
  });
  readonly progressValue = computed(() => {
    const value = this.node().bind === undefined ? this.node().props?.['value'] : this.boundValue();
    return value === undefined || value === null
      ? null
      : typeof value === 'number'
        ? value
        : Number.NaN;
  });
  readonly expandedIds = linkedSignal({
    source: () => {
      const node = this.node(),
        preset = node.props?.['expandedIds'];
      const initial = Array.isArray(preset)
        ? preset.filter((id): id is string => typeof id === 'string')
        : [];
      return {
        key: JSON.stringify([this.identity(), node.id, node.props?.['multi'] === true, initial]),
        ids: node.children?.map((child) => child.id) ?? [],
        initial,
      };
    },
    computation: (source, previous): readonly string[] =>
      (previous?.source.key === source.key ? previous.value : source.initial).filter((id) =>
        source.ids.includes(id),
      ),
  });
  readonly visibleExpanded = computed(() => {
    const visible = new Set(this.visibleChildren().map((child) => child.id));
    return this.expandedIds().filter((id) => visible.has(id));
  });
  text(key: string): string {
    return this.localization.text(this.node().props?.[key]);
  }
  flag(key: string, fallback = false): boolean {
    const value = this.node().props?.[key];
    return typeof value === 'boolean' ? value : fallback;
  }
  display(key: string): string {
    if (this.node().bind === undefined) return this.text(key);
    const value = this.boundValue();
    if (typeof value === 'number')
      return this.localization.number(value, { maximumSignificantDigits: 21 });
    if (typeof value === 'boolean')
      return this.localization.message(value ? 'display.true' : 'display.false');
    return typeof value === 'string' ? value : '';
  }
  updateExpanded(ids: readonly string[]): void {
    if (this.disabled() || this.readonly() || this.flag('readonly')) return;
    const visible = new Set(this.visibleChildren().map((child) => child.id));
    const next = this.flag('multi')
      ? [...this.expandedIds().filter((id) => !visible.has(id)), ...ids]
      : [...ids];
    this.expandedIds.set(next);
    this.event.emit({ event: 'expandedChange', value: next });
  }
  dismiss(): void {
    if (!this.disabled() && !this.readonly() && !this.flag('readonly'))
      this.event.emit({ event: 'dismiss' });
  }
}
