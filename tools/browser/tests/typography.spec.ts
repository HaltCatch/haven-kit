import { test, expect, fixture, filled, bottom } from './support';

test('applies theme typography to natural rows and remeasures the virtual collection', async ({
  page,
}) => {
  const t = await fixture(page);
  const cell = t.rows.first().locator('td').nth(1);
  await expect(cell).toHaveCSS('font-size', '16px');
  await page.getByRole('button', { name: 'Enlarge text', exact: true }).click();
  await expect(cell).toHaveCSS('font-size', '24px');
  await expect(cell).toHaveCSS('font-family', 'serif');
  await filled(t.viewport);
  await bottom(t.viewport, t.rows, 'number:4999');
  await expect.poll(() => t.rows.count()).toBeLessThan(40);
  await t.viewport.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(t.rows.first()).toHaveAttribute('data-virtual-row-id', 'number:0');
  await filled(t.viewport);
});
