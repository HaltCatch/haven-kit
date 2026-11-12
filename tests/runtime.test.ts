import { describe, expect, it, vi } from 'vitest';
import {
  ActionCoordinator,
  ActionRegistry,
  LatestRequest,
  affectsDependency,
  compileCondition,
  executeActions,
} from '@haven/runtime';
import type { ActionContext, ActionResult } from '@haven/runtime';
const context: Omit<ActionContext, 'signal'> = {
  documentId: 'sample',
  revision: 'draft:1',
  nodeId: 'button',
  data: { title: 'initial' },
  selection: [],
};
const success: ActionResult = { status: 'success' };
const failure: ActionResult = { status: 'error', code: 'test', message: 'Failed' };
const defer = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
describe('bounded rules', () => {
  it('uses strict comparison and defined missing/null semantics', () => {
    const condition = compileCondition({ op: 'eq', left: { path: '/a' }, right: { literal: 1 } });
    expect(condition.evaluate({ root: { a: '1' } })).toBe(false);
    expect(condition.evaluate({ root: { a: 1 } })).toBe(true);
    expect(condition.evaluate({ root: {} })).toBe(false);
    expect(
      compileCondition({ op: 'exists', value: { path: '/a' } }).evaluate({ root: { a: null } }),
    ).toBe(true);
  });
  it('isolates root and row scopes and indexes dependencies', () => {
    const rule = compileCondition({
      op: 'eq',
      left: { scope: 'item', path: '/value' },
      right: { path: '/value' },
    });
    expect(rule.dependencies).toEqual(['item:/value', 'root:/value']);
    expect(rule.evaluate({ root: { value: 1 }, item: { value: 2 } })).toBe(false);
    expect(affectsDependency('root:/rows/0/value', 'root:/rows')).toBe(true);
    expect(affectsDependency('root:/row', 'root:/rows')).toBe(false);
  });
  it('limits compilation and compares structured JSON without key-order dependence', () => {
    expect(() =>
      compileCondition({ op: 'not', condition: { op: 'exists', value: { literal: true } } }, 1),
    ).toThrow('limit');
    expect(
      compileCondition({
        op: 'eq',
        left: { literal: { a: 1, b: 2 } },
        right: { literal: { b: 2, a: 1 } },
      }).evaluate({ root: {} }),
    ).toBe(true);
  });
});
describe('action execution', () => {
  it('awaits before/main/after in order and keeps an immutable event snapshot', async () => {
    const registry = new ActionRegistry();
    const gate = defer<ActionResult>();
    const order: string[] = [];
    const trace: string[] = [];
    registry.register({
      id: 'host.before',
      execute: async (_input, ctx) => {
        order.push(String(ctx.data['title']));
        return gate.promise;
      },
    });
    registry.register({
      id: 'host.after',
      execute: async (_input, ctx) => {
        order.push(String(ctx.data['title']));
        expect(Object.isFrozen(ctx.data)).toBe(true);
        return success;
      },
    });
    const mutable = structuredClone(context);
    const running = executeActions(
      registry,
      { before: { handler: 'host.before' }, after: { handler: 'host.after' } },
      { sequence: [{ action: 'before' }, { action: 'after' }] },
      mutable,
      { onTrace: (event) => trace.push(`${event.actionId}:${event.stage}`) },
    );
    await vi.waitFor(() => expect(order).toEqual(['initial']));
    mutable.data = { title: 'changed' };
    gate.resolve(success);
    expect(await running).toEqual(success);
    expect(order).toEqual(['initial', 'initial']);
    expect(trace).toEqual(['before:start', 'before:finish', 'after:start', 'after:finish']);
  });
  it('stops the sequence on a failed action and validates inputs', async () => {
    const registry = new ActionRegistry();
    const later = vi.fn(async () => success);
    registry.register({ id: 'host.fail', execute: async () => failure });
    registry.register({ id: 'host.later', execute: later });
    expect(
      await executeActions(
        registry,
        { a: { handler: 'host.fail' }, b: { handler: 'host.later' } },
        { sequence: [{ action: 'a' }, { action: 'b' }] },
        context,
      ),
    ).toEqual(failure);
    expect(later).not.toHaveBeenCalled();
    registry.register({ id: 'host.checked', validateInput: () => false, execute: later });
    expect(
      await executeActions(registry, { a: { handler: 'host.checked' } }, { action: 'a' }, context),
    ).toMatchObject({ code: 'action.input' });
  });
  it('settles timeout and abort even if a host ignores cancellation', async () => {
    const registry = new ActionRegistry();
    registry.register({ id: 'host.hang', execute: () => new Promise(() => {}) });
    expect(
      await executeActions(registry, { a: { handler: 'host.hang' } }, { action: 'a' }, context, {
        timeoutMs: 10,
      }),
    ).toMatchObject({ code: 'action.timeout' });
    const controller = new AbortController();
    const running = executeActions(
      registry,
      { a: { handler: 'host.hang' } },
      { action: 'a' },
      context,
      { signal: controller.signal },
    );
    controller.abort();
    expect(await running).toEqual({ status: 'cancelled' });
  });
  it('supports explicit parallel failure policy', async () => {
    const registry = new ActionRegistry();
    registry.register({ id: 'host.fail', execute: async () => failure });
    registry.register({ id: 'host.hang', execute: () => new Promise(() => {}) });
    expect(
      await executeActions(
        registry,
        { a: { handler: 'host.fail' }, b: { handler: 'host.hang' } },
        { parallel: [{ action: 'a' }, { action: 'b' }], failure: 'fail-fast' },
        context,
      ),
    ).toEqual(failure);
  });
  it('rejects duplicate handlers and unknown bindings', async () => {
    const registry = new ActionRegistry();
    registry.register({ id: 'host.action', execute: async () => success });
    expect(() => registry.register({ id: 'host.action', execute: async () => success })).toThrow(
      'Duplicate',
    );
    expect(() => registry.register({ id: 'bare', execute: async () => success })).toThrow(
      'namespaced',
    );
    expect(await executeActions(registry, {}, { action: 'unknown' }, context)).toMatchObject({
      code: 'action.unknown',
    });
  });
  it('rejects reentry or replaces the old invocation without stale cleanup removing the new one', async () => {
    const coordinator = new ActionCoordinator();
    const gate = defer<ActionResult>();
    const first = coordinator.run('button', 'reject', () => gate.promise);
    expect(await coordinator.run('button', 'reject', async () => success)).toMatchObject({
      code: 'action.busy',
    });
    const secondGate = defer<ActionResult>();
    const second = coordinator.run('button', 'replace', () => secondGate.promise);
    expect(await first).toEqual({ status: 'cancelled' });
    expect(await coordinator.run('button', 'reject', async () => success)).toMatchObject({
      code: 'action.busy',
    });
    secondGate.resolve(success);
    expect(await second).toEqual(success);
    coordinator.dispose();
  });
});
describe('async query ownership', () => {
  it('does not let a late previous response replace the current results', async () => {
    const requests = new LatestRequest<string>();
    const old = defer<string>();
    const first = requests.run(() => old.promise);
    expect(await requests.run(async () => 'new')).toEqual({ current: true, value: 'new' });
    old.resolve('old');
    expect(await first).toEqual({ current: false });
    requests.dispose();
  });
  it('ignores disposed errors but propagates active errors', async () => {
    const requests = new LatestRequest<string>();
    await expect(
      requests.run(async () => {
        throw new Error('network');
      }),
    ).rejects.toThrow('network');
    const gate = defer<string>();
    const pending = requests.run(() => gate.promise);
    requests.dispose();
    gate.resolve('late');
    expect(await pending).toEqual({ current: false });
  });
});
