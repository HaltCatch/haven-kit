import { isTableRendererParams } from '@haven/schema';
import type { JsonPrimitive } from '@haven/schema';
import type { HavenTableCellContext } from './cell-renderers';

export type HavenTableExportScope = 'filtered' | 'page' | 'loaded-page';
export interface HavenTableCsvOptions {
  readonly scope: HavenTableExportScope;
  /** Structured custom-renderer values require explicit opt-in; DOM/HTML is never exported. */
  readonly objectValues?: 'reject' | 'json';
  readonly bom?: boolean;
  /** Trusted host callbacks, never persisted executable code. Returned strings remain protected. */
  readonly formatters?: ReadonlyMap<string, (context: HavenTableCellContext) => JsonPrimitive>;
}
export type HavenTableCsvResult =
  | {
      readonly status: 'ready';
      readonly csv: string;
      readonly scope: HavenTableExportScope;
      readonly rowCount: number;
      readonly columnIds: readonly string[];
      readonly mimeType: 'text/csv;charset=utf-8';
    }
  | {
      readonly status: 'error';
      readonly code: 'unavailable' | 'scope' | 'columns' | 'value' | 'limit' | 'download';
      readonly columnId?: string;
    };
/** RFC 4180 quoting plus OWASP formula protection. Protection is applied after formatting.
 * NFKC is only used for detection; original Unicode text is preserved in the exported value. */
export function encodeHavenCsvCell(
  value: unknown,
  objectValues: 'reject' | 'json' = 'reject',
): string {
  let text: string;
  if (value === null || value === undefined) text = '';
  else if (typeof value === 'number' && Number.isFinite(value)) text = String(value);
  else if (typeof value === 'boolean') text = String(value);
  else if (typeof value === 'string') text = protectFormula(value);
  else if (objectValues === 'json' && typeof value === 'object' && isTableRendererParams({ value }))
    text = protectFormula(JSON.stringify(value));
  else throw new Error('Unsupported CSV value');
  return '"' + text.replaceAll('"', '""') + '"';
}
function protectFormula(value: string): string {
  const normalized = value.normalize('NFKC');
  // Include leading whitespace, controls and format marks that spreadsheet importers may trim.
  const leading = /^[\p{White_Space}\p{Cc}\p{Cf}]*/u.exec(normalized)![0];
  const dangerous =
    /[\p{Cc}]/u.test(leading) || /^[=+\-@−]/u.test(normalized.slice(leading.length));
  return dangerous ? "'" + value : value;
}
