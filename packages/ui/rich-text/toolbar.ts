import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { HavenLocalization } from '@haven/ui';

@Component({
  selector: 'haven-rich-text-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <div role="group" [attr.aria-label]="localization.message('richText.toolbar')">
      @for (item of formats; track item.name) {
        <button matButton type="button" [disabled]="disabled()" (click)="format.emit(item)">
          {{ localization.message('richText.' + item.name) }}
        </button>
      }
      <button
        matButton
        type="button"
        [disabled]="disabled()"
        (click)="format.emit({ name: 'list', value: 'ordered' })"
      >
        {{ localization.message('richText.ordered') }}
      </button>
      <button
        matButton
        type="button"
        [disabled]="disabled()"
        (click)="format.emit({ name: 'list', value: 'bullet' })"
      >
        {{ localization.message('richText.bullet') }}
      </button>
      @for (name of commands; track name) {
        <button matButton type="button" [disabled]="disabled()" (click)="commanded.emit(name)">
          {{ localization.message('richText.' + name) }}
        </button>
      }
      <mat-form-field appearance="outline"
        ><mat-label>{{ localization.message('richText.link') }}</mat-label
        ><input
          #link
          matInput
          type="url"
          [disabled]="disabled()"
          [value]="linkValue()"
          (input)="linkValue.set(link.value)"
      /></mat-form-field>
      <button
        matButton
        type="button"
        [disabled]="disabled() || !validLink(linkValue())"
        (click)="format.emit({ name: 'link', value: linkValue() })"
      >
        {{ localization.message('richText.applyLink') }}
      </button>
      <button
        matButton
        type="button"
        [disabled]="disabled()"
        (click)="format.emit({ name: 'link', value: false })"
      >
        {{ localization.message('richText.removeLink') }}
      </button>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    [role='group'] {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--haven-gap-xs);
    }
    mat-form-field {
      width: min(100%, 18rem);
    }
  `,
})
export class RichTextToolbar {
  readonly localization = inject(HavenLocalization);
  readonly disabled = input(false);
  readonly identity = input('');
  readonly linkValue = signal('');
  constructor() {
    effect(() => {
      this.identity();
      this.linkValue.set('');
    });
  }
  readonly format = output<{ name: string; value: string | number | boolean }>();
  readonly commanded = output<'undo' | 'redo' | 'clearFormat'>();
  readonly formats = [
    { name: 'bold', value: true },
    { name: 'italic', value: true },
    { name: 'underline', value: true },
    { name: 'strike', value: true },
    { name: 'header', value: 2 },
    { name: 'blockquote', value: true },
  ];
  readonly commands = ['undo', 'redo', 'clearFormat'] as const;
  validLink(value: string): boolean {
    try {
      return ['http:', 'https:', 'mailto:'].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }
}
