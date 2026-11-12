import { signal } from '@angular/core';
import { ActionCoordinator, executeActions } from '@haven/runtime';
import type { ActionContext, ActionResult, ActionTrace } from '@haven/runtime';
import type { ActionBinding } from '@haven/schema';
import type { HavenRendererHost } from './host';

export interface HavenActionOutcome {
  nodeId: string;
  event: string;
  instanceId?: string;
  result: ActionResult;
}
export interface HavenActionTrace extends ActionTrace {
  nodeId: string;
  instanceId?: string;
  event: string;
}
interface DispatchRequest {
  host: HavenRendererHost;
  bindings: Readonly<Record<string, ActionBinding>>;
  ids: readonly string[];
  context: Omit<ActionContext, 'signal'>;
  event: string;
  scope?: string;
  result: (outcome: HavenActionOutcome) => void;
  trace: (entry: HavenActionTrace) => void;
}

/** One instance per renderer; all asynchronous continuations belong to its current document. */
export class RendererActionDispatcher {
  readonly pending = signal<ReadonlyMap<string, string>>(new Map());
  readonly failure = signal<HavenActionOutcome | null>(null);
  readonly #coordinator = new ActionCoordinator();
  readonly #tokens = new Map<string, object>();
  #epoch = 0;
  busy(nodeId: string): boolean {
    return [...this.pending().values()].includes(nodeId);
  }
  forget(instanceId: string): void {
    const next = new Map(this.pending());
    for (const [key, owner] of next)
      if (owner === instanceId) {
        this.#coordinator.cancel(key);
        this.#tokens.delete(key);
        next.delete(key);
      }
    this.pending.set(next);
  }
  retainScopes(instanceId: string, scopes: ReadonlySet<string>): void {
    const next = new Map(this.pending());
    for (const [key, owner] of next) {
      const scope: unknown = (JSON.parse(key) as unknown[])[2];
      if (owner === instanceId && typeof scope === 'string' && !scopes.has(scope)) {
        this.#coordinator.cancel(key);
        this.#tokens.delete(key);
        next.delete(key);
      }
    }
    if (next.size !== this.pending().size) this.pending.set(next);
  }
  reset(): void {
    this.#epoch++;
    this.#coordinator.dispose();
    this.#tokens.clear();
    this.pending.set(new Map());
    this.failure.set(null);
  }
  async dispatch(request: DispatchRequest): Promise<void> {
    if (!request.ids.length) return;
    const { context, event, host } = request;
    const instanceId = context.instanceId ?? context.nodeId;
    const key = JSON.stringify([instanceId, event, request.scope ?? null]);
    const policy = host.actionReentry ?? (event === 'change' ? 'replace' : 'reject');
    const epoch = this.#epoch;
    const notify = (result: ActionResult) => {
      if (epoch !== this.#epoch) return;
      const outcome = {
        nodeId: context.nodeId,
        event,
        result,
        ...(context.instanceId ? { instanceId } : {}),
      };
      if (result.status === 'error') this.failure.set(outcome);
      request.result(outcome);
    };
    if (this.#tokens.has(key) && policy === 'reject') {
      notify({ status: 'error', code: 'action.busy', message: 'An action is already running' });
      return;
    }
    if (!host.actions) {
      notify({
        status: 'error',
        code: 'action.unconfigured',
        message: 'The host has not configured actions',
      });
      return;
    }
    const token = {};
    this.#tokens.set(key, token);
    this.pending.update((value) => new Map(value).set(key, instanceId));
    this.failure.set(null);
    let result: ActionResult;
    try {
      result = await this.#coordinator.run(key, policy, (signal) =>
        executeActions(
          host.actions!,
          request.bindings,
          { sequence: request.ids.map((action) => ({ action })) },
          context,
          {
            signal,
            ...(host.actionTimeoutMs === undefined ? {} : { timeoutMs: host.actionTimeoutMs }),
            onTrace: (entry) => {
              if (epoch === this.#epoch && this.#tokens.get(key) === token)
                request.trace({
                  ...entry,
                  nodeId: context.nodeId,
                  event,
                  ...(context.instanceId ? { instanceId } : {}),
                });
            },
          },
        ),
      );
    } catch {
      result = { status: 'error', code: 'action.failed', message: 'The host action failed' };
    }
    if (epoch !== this.#epoch || this.#tokens.get(key) !== token) return;
    this.#tokens.delete(key);
    this.pending.update((value) => {
      const next = new Map(value);
      next.delete(key);
      return next;
    });
    notify(result);
  }
}
