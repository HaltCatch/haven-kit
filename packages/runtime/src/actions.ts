import type { ActionBinding, JsonObject, JsonValue } from '@haven/schema';
import { resolveValue } from './rules.js';
export type ActionResult =
  | { status: 'success'; value?: JsonValue }
  | { status: 'cancelled' }
  | { status: 'error'; code: string; message: string };
export interface ActionContext {
  documentId: string;
  revision: string;
  nodeId: string;
  /** Runtime UI instance identity; never stored in a page model. */
  instanceId?: string;
  data: Readonly<JsonObject>;
  item?: JsonValue;
  event?: JsonValue;
  selection: readonly (string | number)[];
  signal: AbortSignal;
}
export interface ActionDefinition {
  id: string;
  validateInput?: (input: JsonObject) => boolean;
  execute: (input: JsonObject, context: ActionContext) => Promise<ActionResult>;
}
export class ActionRegistry {
  readonly #handlers = new Map<string, ActionDefinition>();
  register(definition: ActionDefinition): void {
    if (!/^[a-zA-Z][a-zA-Z0-9_.-]*\.[a-zA-Z0-9_.-]+$/.test(definition.id))
      throw new Error('Action ID must be namespaced');
    if (this.#handlers.has(definition.id)) throw new Error(`Duplicate action: ${definition.id}`);
    this.#handlers.set(definition.id, Object.freeze({ ...definition }));
  }
  get(id: string): ActionDefinition | undefined {
    return this.#handlers.get(id);
  }
}
export type ActionPlan =
  | { action: string }
  | { sequence: ActionPlan[] }
  | { parallel: ActionPlan[]; failure: 'fail-fast' | 'collect' };
export interface ActionTrace {
  actionId: string;
  stage: 'start' | 'finish';
  status?: ActionResult['status'];
}
export interface ExecuteOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  onTrace?: (entry: ActionTrace) => void;
  maxSteps?: number;
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function error(code: string, message: string): ActionResult {
  return { status: 'error', code, message };
}
/** Waits for cancellation even when a host adapter ignores its AbortSignal. */
async function cancellable<T>(work: Promise<T>, signal: AbortSignal): Promise<T | undefined> {
  if (signal.aborted) return undefined;
  let listener: () => void = () => {};
  const aborted = new Promise<undefined>((resolve) => {
    listener = () => resolve(undefined);
    signal.addEventListener('abort', listener, { once: true });
  });
  try {
    return await Promise.race([work, aborted]);
  } finally {
    signal.removeEventListener('abort', listener);
  }
}
export async function executeActions(
  registry: ActionRegistry,
  bindings: Readonly<Record<string, ActionBinding>>,
  plan: ActionPlan,
  context: Omit<ActionContext, 'signal'>,
  options: ExecuteOptions = {},
): Promise<ActionResult> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    return error('action.timeoutConfig', 'Timeout must be positive and finite');
  const pending = [{ plan, depth: 0 }];
  let count = 0;
  while (pending.length) {
    const step = pending.pop()!;
    if (++count > (options.maxSteps ?? 256) || step.depth > 48)
      return error('action.limit', 'Action plan exceeds limits');
    if ('sequence' in step.plan)
      pending.push(...step.plan.sequence.map((plan) => ({ plan, depth: step.depth + 1 })));
    if ('parallel' in step.plan)
      pending.push(...step.plan.parallel.map((plan) => ({ plan, depth: step.depth + 1 })));
  }
  const controller = new AbortController();
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const snapshot = freeze(structuredClone(context));
  const definitions = structuredClone(bindings);
  const trace = (entry: ActionTrace) => {
    try {
      options.onTrace?.(entry);
    } catch {
      /* A diagnostic observer cannot alter application execution. */
    }
  };
  async function run(step: ActionPlan, currentSignal: AbortSignal): Promise<ActionResult> {
    if (currentSignal.aborted) return { status: 'cancelled' };
    if ('sequence' in step) {
      let result: ActionResult = { status: 'success' };
      for (const child of step.sequence) {
        result = await run(child, currentSignal);
        if (result.status !== 'success') break;
      }
      return result;
    }
    if ('parallel' in step) {
      const group = new AbortController();
      const childSignal = AbortSignal.any([currentSignal, group.signal]);
      let firstFailure: ActionResult | undefined;
      const results = await Promise.all(
        step.parallel.map(async (child) => {
          const result = await run(child, childSignal);
          if (result.status !== 'success' && !firstFailure) {
            firstFailure = result;
            if (step.failure === 'fail-fast') group.abort();
          }
          return result;
        }),
      );
      if (step.failure === 'collect')
        return firstFailure
          ? error('action.parallel', 'One or more parallel actions failed')
          : {
              status: 'success',
              value: results.map((r) => (r.status === 'success' ? (r.value ?? null) : null)),
            };
      return firstFailure ?? { status: 'success' };
    }
    const binding = definitions[step.action];
    const handler = binding && registry.get(binding.handler);
    if (!binding || !handler) return error('action.unknown', `Unknown action: ${step.action}`);
    trace({ actionId: step.action, stage: 'start' });
    let result: ActionResult;
    try {
      const input: JsonObject = {};
      for (const [key, ref] of Object.entries(binding.input ?? {})) {
        const value = resolveValue(ref, {
          root: snapshot.data,
          item: snapshot.item,
          event: snapshot.event,
        });
        if (value === undefined) throw new Error(`Missing input: ${key}`);
        Object.defineProperty(input, key, { value: structuredClone(value), enumerable: true });
      }
      if (handler.validateInput && !handler.validateInput(input))
        result = error('action.input', 'Action input is invalid');
      else
        result = (await cancellable(
          Promise.resolve().then(() =>
            currentSignal.aborted
              ? { status: 'cancelled' as const }
              : handler.execute(freeze(input), { ...snapshot, signal: currentSignal }),
          ),
          currentSignal,
        )) ?? { status: 'cancelled' };
    } catch (cause) {
      result = currentSignal.aborted
        ? { status: 'cancelled' }
        : error('action.failed', cause instanceof Error ? cause.message : 'Action failed');
    }
    trace({ actionId: step.action, stage: 'finish', status: result.status });
    return result;
  }
  try {
    const result = await run(plan, signal);
    return timedOut ? error('action.timeout', 'Action timed out') : result;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
/** Per-renderer coordinator. Replacement cancels stale local continuations. */
export class ActionCoordinator {
  readonly #active = new Map<string, AbortController>();
  async run(
    key: string,
    policy: 'reject' | 'replace',
    execute: (signal: AbortSignal) => Promise<ActionResult>,
  ): Promise<ActionResult> {
    const previous = this.#active.get(key);
    if (previous && policy === 'reject')
      return error('action.busy', 'An action is already running');
    previous?.abort();
    const controller = new AbortController();
    this.#active.set(key, controller);
    try {
      return (
        (await cancellable(execute(controller.signal), controller.signal)) ?? {
          status: 'cancelled',
        }
      );
    } finally {
      if (this.#active.get(key) === controller) this.#active.delete(key);
    }
  }
  cancel(key: string): void {
    this.#active.get(key)?.abort();
    this.#active.delete(key);
  }
  dispose(): void {
    for (const controller of this.#active.values()) controller.abort();
    this.#active.clear();
  }
}
