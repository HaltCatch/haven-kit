import type {
  HavenTableCellRenderers,
  HavenTableFilters,
  HavenTableEditors,
  HavenTableTooltips,
} from '@haven/ui/table';
import { InjectionToken } from '@angular/core';
import type { Provider } from '@angular/core';
import type {
  ActionRegistry,
  OptionsAdapter,
  TreeDataAdapter,
  UploadAdapter,
  TableDataAdapter,
  TableEditHandler,
  ValidationAdapter,
} from '@haven/runtime';

/** Host-owned implementations. Models reference stable IDs, never executable code or URLs. */
export interface HavenRendererHost {
  /** Bounds expanded runtime nodes, including nested repeat instances. Default: 10,000. */
  maxRenderedNodes?: number;
  actions?: ActionRegistry;
  tableCellRenderers?: HavenTableCellRenderers;
  tableFilters?: HavenTableFilters;
  tableEditors?: HavenTableEditors;
  tableTooltips?: HavenTableTooltips;
  options?: ReadonlyMap<string, OptionsAdapter>;
  trees?: ReadonlyMap<string, TreeDataAdapter>;
  uploads?: ReadonlyMap<string, UploadAdapter>;
  tables?: ReadonlyMap<string, TableDataAdapter>;
  /** Explicit remote write ports, separately registered from read-only table query adapters. */
  tableEdits?: ReadonlyMap<string, TableEditHandler>;
  validators?: ReadonlyMap<string, ValidationAdapter>;
  revision?: string;
  actionTimeoutMs?: number;
  actionReentry?: 'reject' | 'replace';
}

export const HAVEN_RENDERER_HOST = new InjectionToken<HavenRendererHost>('Haven renderer host', {
  providedIn: 'root',
  factory: () => ({}),
});
export function provideHavenRendererHost(host: HavenRendererHost): Provider {
  return { provide: HAVEN_RENDERER_HOST, useValue: host };
}
