import { test, expect, fixture, filled, bottom, geometry } from './support';

test('bounds real DOM through first, middle and last rows while retaining only focused records', async ({
  page,
}) => {
  const t = await fixture(page);
  await expect(page.locator('[data-fixture="row-count"]')).toHaveText('5000');
  await expect(t.rows.first()).toHaveAttribute('data-virtual-row-id', 'number:0');
  await expect.poll(() => t.rows.count()).toBeLessThan(40);
  await filled(t.viewport);
  const checkbox = t.table.getByRole('checkbox', { name: 'Select row 0', exact: true });
  await checkbox.focus();
  await t.viewport.evaluate((element) => {
    element.scrollTop = 80000;
  });
  await expect.poll(async () => (await geometry(t.viewport)).visible[0]).not.toBe('number:0');
  await expect(checkbox).toBeFocused();
  await expect.poll(() => t.rows.count()).toBeLessThan(40);
  await filled(t.viewport);
  await expect(t.table.locator('tr.virtual-spacer')).toHaveCount(2);
  await page.getByRole('button', { name: 'Toggle theme', exact: true }).focus();
  await expect(checkbox).toHaveCount(0);
  await bottom(t.viewport, t.rows, 'number:4999');
  await expect.poll(() => t.rows.count()).toBeLessThan(40);
  await expect(t.table.getByRole('table')).toHaveAttribute('aria-rowcount', '5002');
  await t.viewport.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(t.rows.first()).toHaveAttribute('data-virtual-row-id', 'number:0');
  await filled(t.viewport);
});

test('measures natural custom content and preserves grouped sticky pins under theme, RTL and width changes', async ({
  page,
}) => {
  const t = await fixture(page);
  const first = t.rows.first(),
    original = (await first.boundingBox())!.height;
  await first.getByRole('button', { name: 'Grow row', exact: true }).click();
  await expect
    .poll(async () => (await first.boundingBox())!.height)
    .toBeGreaterThan(original + 100);
  await filled(t.viewport);
  const grown = first.locator('[data-fixture="grown-content"]');
  expect(await grown.evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(
    true,
  );
  await first.getByRole('button', { name: 'Shrink row', exact: true }).click();
  await t.viewport.evaluate((element) => {
    element.scrollTop = 18000;
    element.scrollLeft = 300;
  });
  await filled(t.viewport);
  const id = t.table.getByRole('columnheader', { name: /Sort by ID/ }),
    amount = t.table.getByRole('columnheader', { name: /Sort by Amount/ });
  await expect
    .poll(async () =>
      Math.abs(
        (await t.table.locator('thead').boundingBox())!.y - (await t.viewport.boundingBox())!.y,
      ),
    )
    .toBeLessThan(2);
  const pinGap = async (leading: boolean, rtl: boolean) => {
    const box = (await (leading ? id : amount).boundingBox())!;
    const edges = await t.viewport.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left + element.clientLeft,
        right: rect.left + element.clientLeft + element.clientWidth,
      };
    });
    return Math.abs(leading !== rtl ? box.x - edges.left : box.x + box.width - edges.right);
  };
  await expect.poll(() => pinGap(true, false)).toBeLessThan(2);
  await expect.poll(() => pinGap(false, false)).toBeLessThan(2);
  await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
  await expect(page.locator('[data-fixture="preset"]')).toHaveText('liquid-glass');
  await page.getByRole('button', { name: 'Toggle direction', exact: true }).click();
  await expect(page.locator('[data-fixture="root"]')).toHaveAttribute('dir', 'rtl');
  await expect(t.viewport).toHaveCSS('direction', 'rtl');
  await t.viewport.evaluate((element) => {
    element.scrollLeft = -300;
  });
  await expect.poll(() => pinGap(true, true)).toBeLessThan(2);
  await expect.poll(() => pinGap(false, true)).toBeLessThan(2);
  await filled(t.viewport);
  await page.getByRole('button', { name: 'Widen columns', exact: true }).click();
  await expect(id).toHaveCSS('width', '240px');
  await expect.poll(() => pinGap(true, true)).toBeLessThan(2);
  await filled(t.viewport);
  await page.setViewportSize({ width: 393, height: 852 });
  await expect(t.viewport).toHaveAttribute('data-pinning-paused', 'true');
  await filled(t.viewport);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await expect(t.viewport).not.toHaveAttribute('data-pinning-paused', 'true');
  await filled(t.viewport);
});
