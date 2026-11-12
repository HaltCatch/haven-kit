import type { AssetReference, JsonObject, JsonValue } from '@haven/schema';
export interface Sort {
  path: string;
  direction: 'asc' | 'desc';
}
export interface Filter {
  path: string;
  operator: 'eq' | 'contains' | 'gt' | 'lt';
  value: JsonValue;
}
export type PageRequest =
  | { mode: 'offset'; page: number; pageSize: number }
  | { mode: 'cursor'; cursor?: string; pageSize: number };
export interface QueryRequest {
  pagination: PageRequest;
  sort: readonly Sort[];
  filters: readonly Filter[];
  signal: AbortSignal;
}
export type QueryResult<T extends JsonObject = JsonObject> =
  | { mode: 'offset'; items: T[]; total: number }
  | { mode: 'cursor'; items: T[]; nextCursor?: string };
export interface QueryAdapter {
  query(request: QueryRequest): Promise<QueryResult>;
}
export interface Option {
  key: string | number;
  label: string;
  disabled?: boolean;
  children?: Option[];
}
export interface OptionsAdapter {
  search(request: {
    text: string;
    locale?: string;
    cursor?: string;
    signal: AbortSignal;
  }): Promise<{ items: Option[]; nextCursor?: string }>;
  resolve(
    keys: readonly (string | number)[],
    signal: AbortSignal,
    context?: { locale?: string },
  ): Promise<Option[]>;
}
export type FileReference = AssetReference;
export interface UploadAdapter {
  upload(
    file: Blob,
    name: string,
    options: { signal: AbortSignal; progress: (loaded: number, total: number) => void },
  ): Promise<FileReference>;
  url(file: FileReference, signal: AbortSignal): Promise<string>;
}
/** A new request supersedes the old one, even if the transport ignores abort. */
export class LatestRequest<T> {
  #generation = 0;
  #controller?: AbortController;
  async run(
    load: (signal: AbortSignal) => Promise<T>,
  ): Promise<{ current: true; value: T } | { current: false }> {
    this.#controller?.abort();
    const controller = new AbortController();
    this.#controller = controller;
    const generation = ++this.#generation;
    try {
      const value = await load(controller.signal);
      return generation === this.#generation && !controller.signal.aborted
        ? { current: true, value }
        : { current: false };
    } catch (error) {
      if (generation !== this.#generation || controller.signal.aborted) return { current: false };
      throw error;
    }
  }
  dispose(): void {
    this.#generation++;
    this.#controller?.abort();
  }
}
