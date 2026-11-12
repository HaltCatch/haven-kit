import type { HavenTableCsvResult } from './csv';
/** Download is an explicit caller action, separate from deterministic CSV creation. */
export function downloadHavenTableCsv(
  result: HavenTableCsvResult,
  filename = 'table.csv',
): boolean {
  if (result.status !== 'ready' || typeof document === 'undefined') return false;
  let url: string | undefined;
  let anchor: HTMLAnchorElement | undefined;
  try {
    url = URL.createObjectURL(new Blob([result.csv], { type: result.mimeType }));
    anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename.replace(/[\p{Cc}/\\]/gu, '_').slice(0, 200) || 'table.csv';
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    return true;
  } catch {
    return false;
  } finally {
    anchor?.remove();
    // Revoke after the browser has processed the navigation, not before it reads the Blob.
    if (url) setTimeout(() => URL.revokeObjectURL(url!), 0);
  }
}
