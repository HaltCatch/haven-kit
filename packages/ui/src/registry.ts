import type { EnvironmentProviders } from '@angular/core';
import { Injectable, InjectionToken, Type, inject, makeEnvironmentProviders } from '@angular/core';
export interface HavenComponentRegistration {
  kind: string;
  version: number;
  component: Type<unknown>;
}
const HAVEN_COMPONENTS = new InjectionToken<readonly (readonly HavenComponentRegistration[])[]>(
  'Haven components',
);
export function provideHavenComponents(
  components: readonly HavenComponentRegistration[],
): EnvironmentProviders {
  const keys = new Set<string>();
  for (const component of components) {
    const key = `${component.kind}@${component.version}`;
    if (keys.has(key)) throw new Error(`Duplicate component: ${key}`);
    keys.add(key);
  }
  return makeEnvironmentProviders([
    { provide: HAVEN_COMPONENTS, multi: true, useValue: [...components] },
    HavenComponentRegistry,
  ]);
}
@Injectable()
export class HavenComponentRegistry {
  readonly #components = new Map<string, Type<unknown>>();
  constructor() {
    for (const entry of inject(HAVEN_COMPONENTS).flat()) {
      const key = `${entry.kind}@${entry.version}`;
      if (this.#components.has(key)) throw new Error(`Duplicate component: ${key}`);
      this.#components.set(key, entry.component);
    }
  }
  capabilities(): readonly string[] {
    return [...this.#components.keys()].sort();
  }
  get(kind: string, version: number): Type<unknown> | undefined {
    return this.#components.get(`${kind}@${version}`);
  }
}
