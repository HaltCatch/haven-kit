import { test as base, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

export const test = base.extend<{ scriptErrors: string[] }>({
  scriptErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await use(errors);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

export async function fixture(page: Page) {
  await page.goto('/');
  const table = page.locator('haven-table[data-fixture="table"]'),
    viewport = table.locator('.scroll'),
    rows = table.locator('tbody tr[data-virtual-row-id]');
  await expect(table.getByRole('table', { name: 'Synthetic records', exact: true })).toBeVisible();
  await expect.poll(() => rows.count()).toBeGreaterThan(0);
  return { table, viewport, rows };
}

/** Real layout coverage below the sticky header, rather than only virtual index arithmetic. */
export async function geometry(viewport: Locator) {
  return viewport.evaluate((element) => {
    const frame = element.getBoundingClientRect(),
      head = element.querySelector('thead')!.getBoundingClientRect(),
      body = element.querySelector('tbody')!.getBoundingClientRect();
    const start = Math.max(frame.top + element.clientTop, head.bottom),
      end = Math.min(frame.top + element.clientTop + element.clientHeight, body.bottom);
    const rows = [...element.querySelectorAll<HTMLElement>('tr[data-virtual-row-id]')]
      .map((row) => ({ id: row.dataset['virtualRowId'], rect: row.getBoundingClientRect() }))
      .filter(({ rect }) => rect.bottom > start && rect.top < end)
      .sort((a, b) => a.rect.top - b.rect.top);
    let cursor = start,
      gap = 0;
    for (const { rect } of rows) {
      gap = Math.max(gap, rect.top - cursor);
      cursor = Math.max(cursor, rect.bottom);
    }
    gap = Math.max(gap, end - cursor);
    return { gap, visible: rows.map((row) => row.id), start, end, height: head.height };
  });
}

export async function filled(viewport: Locator) {
  await expect.poll(async () => (await geometry(viewport)).gap).toBeLessThan(3);
  await expect.poll(async () => (await geometry(viewport)).visible.length).toBeGreaterThan(0);
}

export async function bottom(viewport: Locator, rows: Locator, id: string) {
  await expect
    .poll(async () => {
      // Dynamic measurements can change the last native scroll offset during first arrival.
      await viewport.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      return rows.last().getAttribute('data-virtual-row-id');
    })
    .toBe(id);
  await filled(viewport);
}
