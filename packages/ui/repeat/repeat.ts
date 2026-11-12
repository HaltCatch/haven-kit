import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  TemplateRef,
  computed,
  effect,
  inject,
  input,
  output,
  viewChild,
  viewChildren,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { HavenLocalization } from '@haven/ui';
import { HavenGlassSurface } from '@haven/ui/glass';
import type { JsonObject, LocalizedText } from '@haven/schema';

export interface HavenRepeatItem {
  readonly key: string | number;
  readonly value: JsonObject;
}
export interface HavenRepeatContext {
  $implicit: JsonObject;
  index: number;
  key: string | number;
}
export interface HavenRepeatRemove {
  key: string | number;
  index: number;
}
export interface HavenRepeatMove {
  key: string | number;
  from: number;
  to: number;
}
type Key = HavenRepeatItem['key'];
interface FocusProposal {
  kind: 'insert' | 'remove' | 'move';
  keys: readonly Key[];
  index: number;
  to?: number;
  trigger: Element | null;
}
function validKey(value: unknown): value is Key {
  return typeof value === 'string'
    ? value.length > 0 && value.length <= 4096
    : typeof value === 'number' && Number.isFinite(value);
}

/** Host-controlled collection: emitted operations are proposals, never implicit data mutations.
 * Projected controls retain their host-owned readonly/disabled and validation bindings.
 */
@Component({
  selector: 'haven-repeat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, MatButtonModule, HavenGlassSurface],
  templateUrl: './repeat.html',
  styleUrl: './repeat.scss',
})
export class HavenRepeat {
  readonly localization = inject(HavenLocalization);
  readonly items = input<readonly HavenRepeatItem[]>([]);
  readonly rowTemplate = input.required<TemplateRef<HavenRepeatContext>>();
  readonly title = input<string | LocalizedText>('');
  readonly description = input<string | LocalizedText>('');
  readonly addLabel = input<string | LocalizedText>('');
  readonly removeLabel = input<string | LocalizedText>('');
  readonly moveUpLabel = input<string | LocalizedText>('');
  readonly moveDownLabel = input<string | LocalizedText>('');
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly minItems = input(0);
  readonly maxItems = input<number>();
  readonly insert = output<{ index: number }>();
  readonly remove = output<HavenRepeatRemove>();
  readonly move = output<HavenRepeatMove>();
  readonly invalid = computed(() => {
    const minimum = this.minItems(),
      maximum = this.maxItems(),
      items: unknown = this.items();
    if (
      !Number.isSafeInteger(minimum) ||
      minimum < 0 ||
      (maximum !== undefined && (!Number.isSafeInteger(maximum) || maximum < minimum)) ||
      !Array.isArray(items)
    )
      return true;
    const keys = new Set<Key>();
    for (const item of items) {
      if (
        !item ||
        typeof item !== 'object' ||
        !validKey(item.key) ||
        keys.has(item.key) ||
        !item.value ||
        typeof item.value !== 'object' ||
        Array.isArray(item.value) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(item.value))
      )
        return true;
      keys.add(item.key);
    }
    return false;
  });
  readonly blocked = computed(() => this.disabled() || this.readonly() || this.invalid());
  readonly canInsert = computed(
    () =>
      !this.blocked() && (this.maxItems() === undefined || this.items().length < this.maxItems()!),
  );
  readonly canRemove = computed(() => !this.blocked() && this.items().length > this.minItems());
  readonly rowElements = viewChildren<ElementRef<HTMLElement>>('row');
  readonly addButton = viewChild('addButton', { read: ElementRef<HTMLButtonElement> });
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly #destroy = inject(DestroyRef);
  #proposal: FocusProposal | undefined;
  constructor() {
    effect(() => {
      const items = this.items(),
        invalid = this.invalid();
      this.rowElements();
      const proposal = this.#proposal;
      if (!proposal || invalid) {
        if (invalid) this.#proposal = undefined;
        return;
      }
      const keys = items.map((item) => item.key);
      if (
        keys.length === proposal.keys.length &&
        keys.every((key, index) => key === proposal.keys[index])
      )
        return;
      this.#proposal = undefined;
      let target = proposal.index;
      const expected = [...proposal.keys];
      if (proposal.kind === 'insert') {
        const key = keys[proposal.index];
        if (key === undefined || expected.includes(key)) return;
        expected.splice(proposal.index, 0, key);
      } else if (proposal.kind === 'remove') {
        expected.splice(proposal.index, 1);
        target = Math.min(proposal.index, keys.length - 1);
      } else {
        const [key] = expected.splice(proposal.index, 1);
        expected.splice(proposal.to!, 0, key!);
        target = proposal.to!;
      }
      if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index]))
        return;
      queueMicrotask(() => {
        if (this.#destroy.destroyed || this.invalid()) return;
        const currentKeys = this.items().map((item) => item.key);
        if (
          currentKeys.length !== expected.length ||
          currentKeys.some((key, index) => key !== expected[index])
        )
          return;
        const document = this.#element.nativeElement.ownerDocument;
        // A deferred host update must not steal focus from another interaction.
        if (document.activeElement !== proposal.trigger && document.activeElement !== document.body)
          return;
        const row = this.rowElements()[target]?.nativeElement;
        if (row) row.focus();
        else this.addButton()?.nativeElement.focus();
      });
    });
  }
  label(value: string | LocalizedText, fallback: string): string {
    return this.localization.text(value) || this.localization.message(fallback);
  }
  rowLabel(index: number): string {
    return this.localization.message('repeat.row', { index: this.localization.number(index + 1) });
  }
  #remember(kind: FocusProposal['kind'], index: number, to?: number): void {
    this.#proposal = {
      kind,
      index,
      ...(to === undefined ? {} : { to }),
      keys: this.items().map((item) => item.key),
      trigger: this.#element.nativeElement.ownerDocument.activeElement,
    };
  }
  requestInsert(index?: number): void {
    if (!this.canInsert()) return;
    index ??= this.items().length;
    if (!Number.isInteger(index) || index < 0 || index > this.items().length) return;
    this.#remember('insert', index);
    this.insert.emit({ index });
  }
  requestRemove(key: Key): void {
    if (!this.canRemove()) return;
    const index = this.items().findIndex((item) => item.key === key);
    if (index < 0) return;
    this.#remember('remove', index);
    this.remove.emit({ key, index });
  }
  requestMove(key: Key, to: number): void {
    if (this.blocked() || !Number.isInteger(to) || to < 0 || to >= this.items().length) return;
    const from = this.items().findIndex((item) => item.key === key);
    if (from < 0 || from === to) return;
    this.#remember('move', from, to);
    this.move.emit({ key, from, to });
  }
}
