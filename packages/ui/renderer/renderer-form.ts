import {
  DestroyRef,
  EnvironmentInjector,
  createEnvironmentInjector,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import type { WritableSignal } from '@angular/core';
import { form } from '@angular/forms/signals';
import type { FieldTree } from '@angular/forms/signals';
import { fieldAt, formSchema } from '@haven/ui/form-state';
import type { FieldPolicy, ValidationScope } from '@haven/ui/form-state';
import { reconcileData } from '@haven/runtime';
import type { ValidationAdapter } from '@haven/runtime';
import type { HavenDocument, JsonObject } from '@haven/schema';
import type { NodeState } from './field-policy';

interface RendererFormSource {
  document(): HavenDocument;
  value: WritableSignal<JsonObject>;
  identity(): string;
  structure(): string;
  structural(): boolean;
  ready(): boolean;
  plan(): ValidationScope;
  states(): ReadonlyMap<string, NodeState>;
  sourceId(instanceId: string): string;
  policy(pointer: string): FieldPolicy;
  validator(resource: string): ValidationAdapter | undefined;
}

/** Native form lifetime; cosmetic changes preserve fields, structure changes reconcile once. */
export function injectRendererForm(source: RendererFormSource) {
  const parent = inject(EnvironmentInjector);
  const fields = signal<FieldTree<Record<string, unknown>> | undefined>(undefined);
  let owner: string | undefined;
  let structure: string | undefined;
  effect((cleanup) => {
    const identity = source.identity();
    source.structure();
    if (!source.structural()) return;
    untracked(() => {
      const prior = owner === identity ? fields() : undefined;
      const remembered = new Map<string, { touched: boolean; dirty: boolean }>();
      if (prior)
        for (const state of source.states().values())
          if (state.node.bind) {
            const field = fieldAt(prior, state.node.bind);
            if (field)
              remembered.set(state.node.bind, {
                touched: field().touched(),
                dirty: field().dirty(),
              });
          }
      const next = reconcileData(source.document().dataSchema, source.value());
      if (next === null || typeof next !== 'object' || Array.isArray(next)) return;
      source.value.set(next);
      const injector = createEnvironmentInjector([], parent);
      const lifetime = injector.get(DestroyRef),
        shape = source.structure();
      const tree = form(
        source.value as WritableSignal<Record<string, unknown>>,
        formSchema(source.document().dataSchema, (pointer) => source.policy(pointer), {
          plan: source.plan(),
          environment: {
            owner: lifetime,
            adapter: (resource) => source.validator(resource),
            active: (sourceId, pointer) =>
              [...source.states().values()].some(
                (state) =>
                  state.node.bind === pointer &&
                  source.sourceId(state.node.id) === sourceId &&
                  state.visible &&
                  !state.disabled &&
                  !state.readonly,
              ),
          },
          ready: () =>
            !lifetime.destroyed &&
            identity === source.identity() &&
            shape === source.structure() &&
            source.ready(),
        }),
        { injector },
      );
      for (const [pointer, state] of remembered) {
        const field = fieldAt(tree, pointer);
        if (state.touched) field?.().markAsTouched();
        if (state.dirty) field?.().markAsDirty();
      }
      owner = identity;
      structure = source.structure();
      fields.set(tree);
      cleanup(() => injector.destroy());
    });
  });
  return {
    fields,
    current: () => owner === source.identity() && structure === source.structure(),
  };
}
