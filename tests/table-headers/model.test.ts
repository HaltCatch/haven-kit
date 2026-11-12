import { describe, expect, it } from 'vitest';
import { coreManifests, validateDocument } from '@haven/schema';
import { document } from './support.js';

describe('grouped header model diagnostics', () => {
  it('accepts existing flat documents unchanged and advertises the optional array contract', () => {
    expect(validateDocument(document()).diagnostics).toEqual([]);
    expect(
      coreManifests.find((manifest) => manifest.kind === 'table')?.properties['headerGroups'],
    ).toEqual({ type: 'array', label: '分组表头' });
    expect(
      validateDocument(
        document([{ id: 'details', header: 'Details', children: ['name', 'amount'] }]),
      ).diagnostics,
    ).toEqual([]);
  });

  it('locates an invalid group at the table headerGroups property without changing flat columns', () => {
    const model = document([{ id: 'details', header: 'Details', children: ['name'] }]);
    const before = structuredClone(model);
    const result = validateDocument(model);
    expect(result.structural).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'table.headerGroups',
        path: '/ui/props/headerGroups',
        nodeId: 'table',
      }),
    ]);
    expect(model).toEqual(before);
  });
});
