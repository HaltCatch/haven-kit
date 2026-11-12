import type { ElementRef } from '@angular/core';
import type { Row } from '@tanstack/angular-table';
import type { JsonObject, TableVirtualization } from '@haven/schema';
import type { features } from '../features';

export type HavenVirtualTableRow = Row<typeof features, JsonObject>;
export type HavenTableBodyEntry =
  | {
      readonly kind: 'row';
      readonly key: string;
      readonly row: HavenVirtualTableRow;
      readonly index: number;
    }
  | { readonly kind: 'spacer'; readonly key: string; readonly height: number };
export interface HavenTableVirtualInputs {
  config(): TableVirtualization | undefined;
  rows(): readonly HavenVirtualTableRow[];
  viewport(): ElementRef<HTMLElement> | undefined;
  head(): ElementRef<HTMLElement> | undefined;
  body(): ElementRef<HTMLElement> | undefined;
  owner(): string;
  editingId(): string | undefined;
  active(): boolean;
  measurementKey?(): unknown;
}
export interface HavenTableVirtualMeasurement {
  enabled(): boolean;
  measure(element: HTMLTableRowElement): void;
  forget(): void;
}
