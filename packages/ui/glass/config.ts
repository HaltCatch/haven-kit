import { InjectionToken } from '@angular/core';
import type { Provider } from '@angular/core';
export type HavenGlassMode = 'standard' | 'polar' | 'prominent' | 'shader';
export interface HavenGlassConfig {
  mode: HavenGlassMode;
  displacement: number;
  aberration: number;
}
export const HAVEN_GLASS_CONFIG = new InjectionToken<Readonly<HavenGlassConfig>>('Haven glass', {
  providedIn: 'root',
  factory: () => ({ mode: 'standard', displacement: 28, aberration: 0.5 }),
});
/** Application-wide optics; theme tokens supply material colours, radius and frost. */
export function provideHavenGlass(config: Partial<HavenGlassConfig> = {}): Provider {
  return {
    provide: HAVEN_GLASS_CONFIG,
    useValue: { mode: 'standard', displacement: 28, aberration: 0.5, ...config },
  };
}
