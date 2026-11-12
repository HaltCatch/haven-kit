import { test, expect, fixture, filled } from './support';

test('keeps a native Material select editor aligned while its virtual viewport scrolls', async ({
  page,
}) => {
  const t = await fixture(page);
  await t.rows.first().getByRole('button', { name: 'Edit Status', exact: true }).click();
  const select = t.table.getByRole('combobox', { name: 'Status', exact: true });
  await select.click();
  const option = page.getByRole('option', { name: 'Ready', exact: true });
  await expect(option).toBeVisible();
  const panel = page.getByRole('listbox');
  const position = async () => {
    const trigger = (await select.boundingBox())!,
      popup = (await panel.boundingBox())!;
    return { trigger: trigger.y, offset: popup.y - trigger.y };
  };
  // Material owns its native panel offset; verify relative positioning instead of prescribing one.
  const before = await position();
  await t.viewport.evaluate((element) => {
    element.scrollTop += 20;
  });
  await expect(option).toBeVisible();
  await expect.poll(async () => before.trigger - (await position()).trigger).toBeGreaterThan(5);
  await expect
    .poll(async () => Math.abs((await position()).offset - before.offset))
    .toBeLessThan(2);
  await option.click();
  await expect(select).toContainText('Ready');
  await t.table.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.locator('[data-fixture="write-count"]')).toHaveText('1');
  await expect(t.rows.first()).toContainText('Ready');
  await filled(t.viewport);
});
