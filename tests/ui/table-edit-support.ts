import { EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { provideHavenTransloco } from '@haven/ui/i18n';
import english from '@haven/ui/i18n/locales/en-US.json';
import { HavenTable, createHavenLocalTableEditHandler } from '@haven/ui/table';
import type { DataSchema, JsonObject, TableColumn } from '@haven/schema';
export const editSchema: DataSchema = {
  type: 'object',
  required: ['name'],
  properties: {
    id: { type: 'number' },
    name: { type: 'string', minLength: 2 },
    amount: { type: 'number', minimum: 0 },
    active: { type: 'boolean' },
  },
};
export const editColumns: TableColumn[] = [
  { id: 'name', path: '/name', header: 'Name', type: 'text', editor: { id: 'text' } },
  { id: 'amount', path: '/amount', header: 'Amount', type: 'number', editor: { id: 'number' } },
  { id: 'active', path: '/active', header: 'Active', type: 'boolean', editor: { id: 'checkbox' } },
];
export function setupTableEditTests(): void {
  TestBed.configureTestingModule({
    providers: [
      provideTransloco({
        config: { defaultLang: 'en-US', availableLangs: ['en-US'], prodMode: true },
      }),
      provideHavenTransloco(),
    ],
  });
  TestBed.inject(TranslocoService).setTranslation({ haven: english }, 'en-US');
}
export async function editTable(
  mode: 'cell' | 'row' = 'row',
  columns = editColumns,
  schema = editSchema,
  initial: JsonObject[] = [
    { id: 0, name: 'First', amount: 3, active: true },
    { id: 1, name: 'Second', amount: 8, active: false },
  ],
) {
  setupTableEditTests();
  const fixture = TestBed.createComponent(HavenTable),
    table = fixture.componentInstance;
  let rows: readonly JsonObject[] = initial;
  const replace = (next: readonly JsonObject[]) => {
    rows = next;
    fixture.componentRef.setInput('rows', next);
  };
  const handler = createHavenLocalTableEditHandler({
    injector: TestBed.inject(EnvironmentInjector),
    schema,
    columns,
    rowKey: '/id',
    rows: () => rows,
    active: () => !table.disabled() && !table.readonly(),
    replace: (expected, next) => {
      if (rows !== expected) return false;
      replace(next);
      return true;
    },
  });
  for (const [key, value] of Object.entries({
    rows,
    columns,
    itemSchema: schema,
    editMode: mode,
    editHandler: handler,
    pageSize: 1,
  }))
    fixture.componentRef.setInput(key, value);
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const button = (text: string) =>
    [...root.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === text,
    )!;
  return { fixture, table, root, button, replace, rows: () => rows };
}
export function typeTableInput(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
