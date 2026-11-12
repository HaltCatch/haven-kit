import { computed } from '@angular/core';
import type { UiNode } from '@haven/schema';
import type { TreeDataAdapter, TreeDataSource } from '@haven/runtime';
import type { HavenTreeResolution } from '@haven/ui/tree';
import type { HavenRenderer } from '../renderer';
import { OptionResolutionStore } from '../option-resolution';

/** Resolving a key never authorizes a write. Resource identity is separate from cosmetic props. */
export class TreeResourceState {
  readonly #resolutions = new OptionResolutionStore<TreeDataAdapter>();
  constructor(private readonly renderer: HavenRenderer) {}
  adapter(node: UiNode): TreeDataAdapter | undefined {
    const name = node.props?.['resource'];
    const binding = typeof name === 'string' ? this.renderer.document().resources[name] : undefined;
    return binding?.type === 'tree' ? this.renderer.host().trees?.get(binding.adapter) : undefined;
  }
  identity(node: UiNode): string {
    const name = node.props?.['resource'];
    return JSON.stringify([
      this.renderer.fieldIdentity(node),
      node.kind,
      node.kind === 'field.cascader' || node.props?.['leafOnly'] === true,
      name,
      typeof name === 'string' ? this.renderer.document().resources[name] : null,
    ]);
  }
  source(node: () => UiNode) {
    return computed<TreeDataSource | undefined>(
      () => {
        const view = node(),
          current = this.renderer.states().get(view.id)?.node;
        if (!current || this.identity(current) !== this.identity(view)) return undefined;
        const adapter = this.adapter(current);
        return adapter ? { identity: this.identity(current), adapter } : undefined;
      },
      { equal: (a, b) => a?.identity === b?.identity && a?.adapter === b?.adapter },
    );
  }
  set(node: UiNode, result: HavenTreeResolution): void {
    const current = this.renderer.states().get(node.id)?.node;
    if (
      !current ||
      result.locale !== this.renderer.localization.locale() ||
      this.identity(current) !== result.identity ||
      this.identity(node) !== result.identity
    )
      return;
    const adapter = this.adapter(current);
    if (adapter && result.adapter === adapter)
      this.#resolutions.set(
        JSON.stringify([result.identity, result.locale]),
        node.id,
        adapter,
        result,
      );
  }
  get(node: UiNode) {
    // Presentation locale does not close the picker; membership proofs still belong to one locale.
    return this.#resolutions.get(
      JSON.stringify([this.identity(node), this.renderer.localization.locale()]),
      node.id,
      this.adapter(node),
    );
  }
  remove(id: string): void {
    this.#resolutions.remove(id);
  }
}
