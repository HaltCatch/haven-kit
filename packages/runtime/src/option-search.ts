import { LatestRequest } from './adapters.js';
import type { Option, OptionsAdapter } from './adapters.js';

export type OptionKey = string | number;
export type OptionSearchFailure = 'adapter' | 'response';
export interface OptionSearchState {
  readonly items: readonly Option[];
  readonly nextCursor: string | undefined;
  readonly searching: boolean;
  readonly searchError: OptionSearchFailure | null;
  readonly keys: readonly OptionKey[];
  readonly resolved: readonly Option[];
  readonly resolving: boolean;
  readonly resolveReady: boolean;
  readonly resolveError: OptionSearchFailure | null;
}
interface SearchContext {
  adapter: OptionsAdapter;
  text: string;
  locale: string;
}
interface ResolveContext {
  adapter: OptionsAdapter;
  keys: readonly OptionKey[];
  locale: string;
}
interface Page {
  items: readonly Option[];
  nextCursor?: string;
}
class InvalidOptionResponse extends Error {}
const limit = 1000;
function validKey(value: unknown): value is OptionKey {
  return (
    (typeof value === 'string' && value.length > 0 && value.length <= 4096) ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}
/** Flat selection responses are intentionally distinct from tree adapters. Copy before exposing. */
function options(value: unknown): readonly Option[] {
  if (!Array.isArray(value) || value.length > limit) throw new InvalidOptionResponse();
  const keys = new Set<OptionKey>();
  return Object.freeze(
    value.map((entry: unknown) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry))
        throw new InvalidOptionResponse();
      const item = entry as Record<string, unknown>;
      if (
        Object.keys(item).some((key) => !['key', 'label', 'disabled'].includes(key)) ||
        !validKey(item['key']) ||
        typeof item['label'] !== 'string' ||
        item['label'].length > 4096 ||
        (item['disabled'] !== undefined && typeof item['disabled'] !== 'boolean') ||
        keys.has(item['key'])
      )
        throw new InvalidOptionResponse();
      keys.add(item['key']);
      return Object.freeze({
        key: item['key'],
        label: item['label'],
        ...(item['disabled'] === undefined ? {} : { disabled: item['disabled'] }),
      });
    }),
  );
}
function page(value: unknown): Page {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new InvalidOptionResponse();
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !['items', 'nextCursor'].includes(key)))
    throw new InvalidOptionResponse();
  const cursor = result['nextCursor'];
  if (
    cursor !== undefined &&
    (typeof cursor !== 'string' || cursor.length === 0 || cursor.length > 4096)
  )
    throw new InvalidOptionResponse();
  return {
    items: options(result['items']),
    ...(cursor === undefined ? {} : { nextCursor: cursor }),
  };
}

/** Two independent request lanes. A late adapter result can never overwrite a newer identity. */
export class OptionSearch {
  static initialState(): OptionSearchState {
    return Object.freeze({
      items: Object.freeze([]),
      nextCursor: undefined,
      searching: false,
      searchError: null,
      keys: Object.freeze([]),
      resolved: Object.freeze([]),
      resolving: false,
      resolveReady: false,
      resolveError: null,
    });
  }
  #state = OptionSearch.initialState();
  readonly #search = new LatestRequest<Page>();
  readonly #resolve = new LatestRequest<readonly Option[]>();
  #query: SearchContext | undefined;
  #selection: ResolveContext | undefined;
  #failedPage: { cursor?: string; append: boolean } | undefined;
  #cursors = new Set<string>();
  #disposed = false;
  #searchGeneration = 0;
  constructor(private readonly changed: (state: OptionSearchState) => void = () => {}) {}
  get state(): OptionSearchState {
    return this.#state;
  }
  #update(change: Partial<OptionSearchState>): void {
    if (this.#disposed) return;
    this.#state = Object.freeze({ ...this.#state, ...change });
    this.changed(this.#state);
  }
  search(adapter: OptionsAdapter, text: string, locale: string): Promise<void> {
    if (this.#disposed) return Promise.resolve();
    const context = { adapter, text, locale };
    this.#query = context;
    this.#cursors = new Set();
    this.#failedPage = undefined;
    this.#update({ items: Object.freeze([]), nextCursor: undefined });
    return this.#load(context, undefined, false);
  }
  more(): Promise<void> {
    if (
      !this.#query ||
      this.#state.searching ||
      this.#state.nextCursor === undefined ||
      this.#disposed
    )
      return Promise.resolve();
    return this.#load(this.#query, this.#state.nextCursor, true);
  }
  retrySearch(): Promise<void> {
    if (!this.#query || !this.#failedPage || this.#disposed) return Promise.resolve();
    return this.#load(this.#query, this.#failedPage.cursor, this.#failedPage.append);
  }
  async #load(context: SearchContext, cursor: string | undefined, append: boolean): Promise<void> {
    const generation = ++this.#searchGeneration;
    this.#update({ searching: true, searchError: null });
    try {
      const result = await this.#search.run(async (signal) =>
        page(
          await context.adapter.search({
            text: context.text,
            locale: context.locale,
            signal,
            ...(cursor === undefined ? {} : { cursor }),
          }),
        ),
      );
      if (!result.current || this.#disposed || generation !== this.#searchGeneration) return;
      const next = result.value;
      if (
        next.nextCursor !== undefined &&
        (next.nextCursor === cursor || this.#cursors.has(next.nextCursor))
      )
        throw new InvalidOptionResponse();
      const items = append ? options([...this.#state.items, ...next.items]) : next.items;
      if (cursor !== undefined) this.#cursors.add(cursor);
      this.#failedPage = undefined;
      this.#update({ items, nextCursor: next.nextCursor, searching: false, searchError: null });
    } catch (error) {
      if (this.#disposed || generation !== this.#searchGeneration) return;
      this.#failedPage = { ...(cursor === undefined ? {} : { cursor }), append };
      this.#update({
        searching: false,
        searchError: error instanceof InvalidOptionResponse ? 'response' : 'adapter',
      });
    }
  }
  async resolve(
    adapter: OptionsAdapter,
    keys: readonly OptionKey[],
    locale: string,
  ): Promise<void> {
    if (this.#disposed) return;
    const requested = Object.freeze([...new Set(keys)]);
    const context = { adapter, keys: requested, locale };
    this.#selection = context;
    this.#update({
      keys: requested,
      resolved: Object.freeze([]),
      resolving: true,
      resolveReady: false,
      resolveError: null,
    });
    try {
      const result = await this.#resolve.run(async (signal) => {
        if (requested.length > limit || !requested.every(validKey))
          throw new InvalidOptionResponse();
        const resolved = options(
          requested.length ? await adapter.resolve(requested, signal, { locale }) : [],
        );
        const allowed = new Set(requested);
        if (resolved.some((option) => !allowed.has(option.key))) throw new InvalidOptionResponse();
        return resolved;
      });
      if (!result.current || this.#disposed || context !== this.#selection) return;
      this.#update({
        resolved: result.value,
        resolving: false,
        resolveReady: true,
        resolveError: null,
      });
    } catch (error) {
      if (this.#disposed || context !== this.#selection) return;
      this.#update({
        resolving: false,
        resolveReady: false,
        resolveError: error instanceof InvalidOptionResponse ? 'response' : 'adapter',
      });
    }
  }
  retryResolve(): Promise<void> {
    const current = this.#selection;
    return current && !this.#disposed
      ? this.resolve(current.adapter, current.keys, current.locale)
      : Promise.resolve();
  }
  cancelSearch(): void {
    this.#searchGeneration++;
    this.#search.dispose();
    this.#query = undefined;
    this.#failedPage = undefined;
    this.#cursors.clear();
    this.#update({
      items: Object.freeze([]),
      nextCursor: undefined,
      searching: false,
      searchError: null,
    });
  }
  cancelResolve(): void {
    this.#resolve.dispose();
    this.#selection = undefined;
    this.#update({
      keys: Object.freeze([]),
      resolved: Object.freeze([]),
      resolving: false,
      resolveReady: false,
      resolveError: null,
    });
  }
  dispose(): void {
    this.#disposed = true;
    this.#search.dispose();
    this.#resolve.dispose();
  }
}
