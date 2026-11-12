import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import type { Signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import type { HavenTheme, TreeKey } from '@haven/schema';
import { isTreeSelection } from '@haven/schema';
import { HavenLocalization } from '@haven/ui';
import { applyHavenTheme, HAVEN_THEME_CONTEXT } from '@haven/ui/theme';
import { HavenRemoteTree } from './tree';
import type { HavenTreeData } from './data';

export interface RemotePickerData {
  data: HavenTreeData;
  value: TreeKey[];
  title: Signal<string>;
  expanded: readonly TreeKey[];
  leafOnly: boolean;
  filterable: boolean;
  multiple: boolean;
  active(): boolean;
  theme?: Signal<HavenTheme>;
}
@Component({
  selector: 'haven-remote-tree-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: HAVEN_THEME_CONTEXT,
      useFactory: () => inject<RemotePickerData>(MAT_DIALOG_DATA).theme,
    },
  ],
  imports: [MatDialogModule, MatButtonModule, HavenRemoteTree],
  template: `<h2 mat-dialog-title>{{ data.title() }}</h2>
    <mat-dialog-content
      ><haven-remote-tree
        [data]="data.data"
        [active]="data.active"
        [title]="data.title()"
        [expandedKeys]="data.expanded"
        [filterable]="data.filterable"
        [leafOnly]="data.leafOnly"
        [multiple]="data.multiple"
        [selection]="true"
        [activeKey]="selected()[0] ?? null"
        [(selectedKeys)]="selected"
        (activate)="activate($event)"
      />
      @if (data.multiple) {
        <p role="status">
          {{ localization.message('tree.selectedCount', { count: selected().length }) }}
        </p>
        @for (key of selected(); track key) {
          <button matButton type="button" [disabled]="!data.active()" (click)="remove(key)">
            {{ label(key) }} · {{ localization.message('tree.removeSelection') }}
          </button>
        }
      }
    </mat-dialog-content>
    <mat-dialog-actions>
      <button matButton type="button" mat-dialog-close>
        {{ localization.message('tree.cancel') }}
      </button>
      @if (data.multiple) {
        <button matButton="filled" type="button" [disabled]="!canApply()" (click)="apply()">
          {{ localization.message('tree.apply') }}
        </button>
      }
    </mat-dialog-actions>`,
})
export class HavenRemoteTreePicker {
  readonly data = inject<RemotePickerData>(MAT_DIALOG_DATA);
  readonly dialog = inject<MatDialogRef<HavenRemoteTreePicker, TreeKey[]>>(MatDialogRef);
  readonly localization = inject(HavenLocalization);
  readonly selected = signal([...this.data.value]);
  readonly canApply = computed(
    () =>
      this.data.active() &&
      isTreeSelection(this.selected()) &&
      this.selected().every((key) => {
        const entry = this.data.data.state().entries.get(key);
        return (
          entry &&
          (!entry.disabled || this.data.value.includes(key)) &&
          (!this.data.leafOnly || !entry.node.hasChildren)
        );
      }),
  );
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef);
  constructor() {
    effect((cleanup) => {
      const theme = this.data.theme?.();
      if (theme) cleanup(applyHavenTheme(this.#element.nativeElement, theme));
    });
  }
  label(key: TreeKey): string {
    const entry = this.data.data.state().entries.get(key);
    return entry ? this.localization.text(entry.node.label) : String(key);
  }
  remove(key: TreeKey): void {
    if (this.data.active()) this.selected.update((keys) => keys.filter((item) => item !== key));
  }
  activate(key: TreeKey): void {
    if (!this.data.multiple && this.data.active()) this.dialog.close([key]);
  }
  apply(): void {
    if (this.canApply()) this.dialog.close([...this.selected()]);
  }
}
