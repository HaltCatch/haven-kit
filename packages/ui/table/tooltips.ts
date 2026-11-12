import { InjectionToken } from '@angular/core';
import type { Provider } from '@angular/core';
import { isTableRendererId } from '@haven/schema';
import type { HavenTableCellContext } from './cell-renderers';
export type HavenTableTooltipProvider = (context: HavenTableCellContext) => string;
export type HavenTableTooltips = ReadonlyMap<string, HavenTableTooltipProvider>;
export const HAVEN_TABLE_TOOLTIPS = new InjectionToken<HavenTableTooltips>('Haven table tooltips', {
  providedIn: 'root',
  factory: () => new Map(),
});
export function provideHavenTableTooltips(
  entries: Iterable<readonly [string, HavenTableTooltipProvider]>,
): Provider {
  const map = new Map<string, HavenTableTooltipProvider>();
  for (const [id, provider] of entries) {
    if (!isTableRendererId(id) || map.has(id) || typeof provider !== 'function')
      throw new Error(`Invalid table tooltip provider: ${id}`);
    map.set(id, provider);
  }
  return { provide: HAVEN_TABLE_TOOLTIPS, useValue: map };
}
