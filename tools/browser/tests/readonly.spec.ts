import { test, expect, fixture, filled, bottom } from './support';

test('resets native sorting and filtering scroll for readonly tables without losing logical pins', async ({
  page,
}) => {
  const t = await fixture(page);
  await page.getByRole('button', { name: 'Toggle readonly', exact: true }).click();
  await expect(page.locator('[data-fixture="readonly"]')).toHaveText('true');
  await bottom(t.viewport, t.rows, 'number:4999');
  await t.viewport.evaluate((element) => {
    element.scrollLeft = 150;
  });
  await t.table.getByRole('button', { name: 'Sort by Amount', exact: true }).click();
  await expect.poll(() => t.viewport.evaluate((element) => element.scrollTop)).toBe(0);
  await expect.poll(() => t.viewport.evaluate((element) => element.scrollLeft)).toBe(150);
  await expect(t.table.getByRole('columnheader', { name: /Sort by Amount/ })).toHaveAttribute(
    'aria-sort',
    'ascending',
  );
  await filled(t.viewport);
  await t.viewport.evaluate((element) => {
    element.scrollTop = 80000;
  });
  await t.table
    .getByRole('searchbox', { name: 'Filter loaded rows', exact: true })
    .fill('Synthetic record 04999');
  await expect.poll(() => t.viewport.evaluate((element) => element.scrollTop)).toBe(0);
  await expect(t.rows).toHaveCount(1);
  await expect(t.rows.first()).toHaveAttribute('data-virtual-row-id', 'number:4999');
  await expect(
    t.table.getByRole('checkbox', { name: 'Select row 4999', exact: true }),
  ).toBeDisabled();
  await expect(page.locator('[data-fixture="write-count"]')).toHaveText('0');
  await filled(t.viewport);
});
