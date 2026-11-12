import { Directive, TemplateRef, inject, input } from '@angular/core';
import type { LocalizedText } from '@haven/schema';

/** Stable generic panel identity; titles and validity are supplied by the host. */
@Directive({ selector: 'ng-template[havenPanel]' })
export class HavenPanel {
  readonly id = input.required<string>();
  readonly title = input<string | LocalizedText>('');
  readonly disabled = input(false);
  readonly valid = input(true);
  readonly optional = input(false);
  readonly template = inject<TemplateRef<unknown>>(TemplateRef);
}
