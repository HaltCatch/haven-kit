import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import type { Signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { HavenLocalization } from '@haven/ui';
import { applyHavenTheme, HAVEN_THEME_CONTEXT } from '@haven/ui/theme';
import type { HavenTheme, TreeKey, TreeNode } from '@haven/schema';
import { HavenTree } from './tree';
export interface MultiplePickerData {
  nodes: readonly TreeNode[];
  value: TreeKey[];
  expanded: readonly TreeKey[];
  title: Signal<string>;
  filterable: boolean;
  leafOnly: boolean;
  cascade: boolean;
  theme?: Signal<HavenTheme>;
}
/** Internal transactional picker. Material owns focus trapping, Escape and restoration. */
@Component({
  selector: 'haven-tree-multiple-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: HAVEN_THEME_CONTEXT,
      useFactory: () => inject<MultiplePickerData>(MAT_DIALOG_DATA).theme,
    },
  ],
  imports: [MatDialogModule, MatButtonModule, HavenTree],
  template: `<h2 mat-dialog-title>{{ data.title() }}</h2>
    <mat-dialog-content
      ><haven-tree
        [nodes]="data.nodes"
        [title]="data.title()"
        [expandedKeys]="data.expanded"
        [filterable]="data.filterable"
        [leafOnly]="data.leafOnly"
        [cascade]="data.cascade"
        [multiple]="true"
        [(selectedKeys)]="selected"
      />
      <p role="status">
        {{ localization.message('tree.selectedCount', { count: selected().length }) }}
      </p>
    </mat-dialog-content>
    <mat-dialog-actions>
      <button matButton type="button" mat-dialog-close>
        {{ localization.message('tree.cancel') }}
      </button>
      <button matButton="filled" type="button" (click)="dialog.close(selected())">
        {{ localization.message('tree.apply') }}
      </button>
    </mat-dialog-actions>`,
})
export class HavenTreeMultiplePicker {
  readonly data = inject<MultiplePickerData>(MAT_DIALOG_DATA);
  readonly dialog = inject<MatDialogRef<HavenTreeMultiplePicker, TreeKey[]>>(MatDialogRef);
  readonly localization = inject(HavenLocalization);
  readonly selected = signal([...this.data.value]);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef);
  constructor() {
    effect((cleanup) => {
      const theme = this.data.theme?.();
      if (theme) cleanup(applyHavenTheme(this.#element.nativeElement, theme));
    });
  }
}
