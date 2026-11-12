import { describe, expect, it } from 'vitest';
import { isTableQuery } from '@haven/schema';
import type { TableQuery } from '@haven/schema';
import { TableDataLoader, initialTableDataState } from '@haven/runtime';
import type { TableDataPage, TableDataRequest } from '@haven/runtime';
const columns = [{ id: 'label', header: 'Label', path: '/label', type: 'text' as const }];
const query: TableQuery = { pageIndex: 0, pageSize: 2, sort: [], filter: '' };
function setup() {
  let state = initialTableDataState();
  return {
    loader: new TableDataLoader((next) => {
      state = next;
    }),
    state: () => state,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const page = (id: string): TableDataPage => ({ rows: [{ id, label: id }], total: 1 });
describe('remote table offset contract', () => {
  it('restricts queries to known sortable IDs, bounded text and safe offsets', () => {
    expect(isTableQuery(query, columns)).toBe(true);
    for (const invalid of [
      { ...query, pageIndex: -1 },
      { ...query, pageIndex: Number.MAX_SAFE_INTEGER },
      { ...query, pageSize: 1001 },
      { ...query, filter: 'x'.repeat(2001) },
      { ...query, sort: [{ columnId: 'unknown', direction: 'asc' }] },
      { ...query, sort: [{ columnId: 'label', direction: ['asc'] }] },
      { ...query, url: 'https://example.test' },
    ])
      expect(isTableQuery(invalid, columns)).toBe(false);
    expect(
      isTableQuery({ ...query, sort: [{ columnId: 'label', direction: 'asc' }] }, [
        { ...columns[0]!, sortable: false },
      ]),
    ).toBe(false);
  });
  it('snapshots JSON pages and typed keys without allowing an adapter to mutate accepted state', async () => {
    const test = setup(),
      response = {
        rows: [
          { id: 0, label: 'Zero', nested: { name: 'original' } },
          { id: '0', label: 'String' },
        ],
        total: 2,
      };
    await test.loader.load({ load: async () => response }, query, columns, '/id', 'en-US');
    expect(test.state().status).toBe('ready');
    expect(test.state().rows.map((r) => r['id'])).toEqual([0, '0']);
    response.rows[0]!.label = 'changed';
    response.rows[0]!.nested!.name = 'changed';
    expect(test.state().rows[0]!['label']).toBe('Zero');
    expect(Object.isFrozen(test.state().rows[0]!['nested'])).toBe(true);
  });
  it('cancels replaced and disposed requests even when transport ignores its signal', async () => {
    const test = setup(),
      calls: TableDataRequest[] = [],
      first = deferred<TableDataPage>(),
      second = deferred<TableDataPage>();
    const adapter = {
      load: (request: TableDataRequest) => {
        calls.push(request);
        return calls.length === 1 ? first.promise : second.promise;
      },
    };
    const a = test.loader.load(adapter, query, columns, '/id', 'en-US');
    const b = test.loader.load(adapter, { ...query, filter: 'next' }, columns, '/id', 'zh-CN');
    expect(calls[0]!.signal.aborted).toBe(true);
    expect(calls[1]!.locale).toBe('zh-CN');
    second.resolve(page('new'));
    await b;
    first.resolve(page('old'));
    await a;
    expect(test.state().rows[0]!['id']).toBe('new');
    const late = deferred<TableDataPage>();
    let signal!: AbortSignal;
    const pending = test.loader.load(
      {
        load: (request) => {
          signal = request.signal;
          return late.promise;
        },
      },
      query,
      columns,
      '/id',
      'en-US',
    );
    test.loader.dispose();
    expect(signal.aborted).toBe(true);
    const state = test.state();
    late.resolve(page('late'));
    await pending;
    expect(test.state()).toBe(state);
  });
  it('clears stale page rows while loading and separates transport failures from malformed responses', async () => {
    const test = setup();
    await test.loader.load({ load: async () => page('old') }, query, columns, '/id', 'en-US');
    const next = deferred<TableDataPage>();
    const loading = test.loader.load({ load: () => next.promise }, query, columns, '/id', 'en-US');
    expect(test.state()).toMatchObject({ status: 'loading', rows: [], total: null });
    next.reject(new Error('private transport detail'));
    await loading;
    expect(test.state().error).toBe('adapter');
    expect(JSON.stringify(test.state())).not.toContain('private transport');
    const malformed: unknown[] = [
      { rows: [], total: -1 },
      { rows: [], total: 2 },
      {
        rows: [
          { id: 'x', label: 'X' },
          { id: 'x', label: 'Again' },
        ],
        total: 2,
      },
      { rows: [{ id: NaN, label: 'X' }], total: 1 },
      { rows: [{ id: 'x', label: 'X', bad: () => 0 }], total: 1 },
      { rows: [{ id: 'x', label: 42 }], total: 1 },
      { rows: [], total: 0, nextCursor: 'unsupported' },
    ];
    for (const response of malformed) {
      await test.loader.load(
        { load: async () => response as TableDataPage },
        query,
        columns,
        '/id',
        'en-US',
      );
      expect(test.state().error).toBe('response');
      expect(test.state().rows).toEqual([]);
    }
  });
  it('accepts an out-of-range empty window for the UI to clamp, and never invokes adapters for invalid queries', async () => {
    const test = setup();
    let called = 0;
    await test.loader.load(
      {
        load: async () => {
          called++;
          return { rows: [], total: 3 };
        },
      },
      { ...query, pageIndex: 8 },
      columns,
      '/id',
      'en-US',
    );
    expect(test.state()).toMatchObject({ status: 'ready', total: 3, rows: [] });
    await test.loader.load(
      {
        load: async () => {
          called++;
          return page('bad');
        },
      },
      { ...query, pageSize: 0 },
      columns,
      '/id',
      'en-US',
    );
    expect(called).toBe(1);
    expect(test.state().error).toBe('query');
  });
});
