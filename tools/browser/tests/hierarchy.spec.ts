import type { Page } from '@playwright/test';
import { test, expect, filled, bottom, geometry } from './support';

async function hierarchyFixture(page: Page) {
  await page.goto('/');
  const section = page.locator('[data-fixture="hierarchy"]'),
    table = section.locator('haven-table'),
    viewport = table.locator('.scroll'),
    rows = table.locator('tbody tr[data-virtual-row-id]');
  await section.scrollIntoViewIfNeeded();
  await expect(
    table.getByRole('table', { name: 'Synthetic tree records', exact: true }),
  ).toBeVisible();
  await expect.poll(() => rows.count()).toBeGreaterThan(0);
  await filled(viewport);
  return { section, table, viewport, rows };
}
test('keeps typed branch expansion independent, bounds all expanded rows and exports complete native descendants', async ({
  page,
}) => {
  const t = await hierarchyFixture(page);
  await expect(t.section.locator('[data-fixture="tree-row-count"]')).toHaveText('2100');
  await expect(t.section.locator('[data-fixture="tree-visible-count"]')).toHaveText('300');
  await t.table
    .locator('tr[data-virtual-row-id="string:0"]')
    .getByRole('button', { name: /Expand row 0/ })
    .click();
  await expect(t.section.locator('[data-fixture="tree-expanded"]')).toHaveText('["0"]');
  await t.table
    .locator('tr[data-virtual-row-id="number:0"]')
    .getByRole('button', { name: /Expand row 0/ })
    .click();
  await expect(t.section.locator('[data-fixture="tree-expanded"]')).toHaveText('[0,"0"]');
  await t.table.getByRole('button', { name: 'Expand all rows', exact: true }).click();
  await expect(t.section.locator('[data-fixture="tree-visible-count"]')).toHaveText('2100');
  await bottom(t.viewport, t.rows, 'string:node-299-4');
  await expect.poll(() => t.rows.count()).toBeLessThan(40);
  await t.section.getByRole('button', { name: 'Inspect tree expanded CSV', exact: true }).click();
  await expect(t.section.locator('[data-fixture="tree-export-count"]')).toHaveText('2100');
  await expect(t.section.locator('[data-fixture="tree-export-edges"]')).toHaveText('true');
  await t.table.getByRole('button', { name: 'Collapse all rows', exact: true }).click();
  await expect(t.section.locator('[data-fixture="tree-visible-count"]')).toHaveText('300');
  await t.section.getByRole('button', { name: 'Inspect tree filtered CSV', exact: true }).click();
  await expect(t.section.locator('[data-fixture="tree-export-count"]')).toHaveText('2100');
  await t.section.getByRole('button', { name: 'Inspect tree expanded CSV', exact: true }).click();
  await expect(t.section.locator('[data-fixture="tree-export-count"]')).toHaveText('300');
});
test('retains matching descendant ancestors while filtering and native all-selection includes only those canonical records', async ({
  page,
}) => {
  const t = await hierarchyFixture(page);
  await t.table.getByRole('button', { name: 'Expand all rows', exact: true }).click();
  await t.table
    .getByRole('searchbox', { name: 'Filter loaded rows', exact: true })
    .fill('Tree needle');
  await expect(t.section.locator('[data-fixture="tree-visible-count"]')).toHaveText('900');
  await expect(t.table.locator('tr[data-virtual-row-id="number:0"]')).toBeVisible();
  await expect(t.table.locator('tr[data-virtual-row-id="string:node-0-2"]')).toBeVisible();
  await expect(t.table.locator('tr[data-virtual-row-id="string:leaf-0"]')).toBeVisible();
  await expect(t.table.locator('tr[data-virtual-row-id="string:node-0-0"]')).toHaveCount(0);
  await t.table
    .getByRole('checkbox', { name: 'Select all filtered loaded rows', exact: true })
    .check();
  await expect(t.section.locator('[data-fixture="tree-selected-count"]')).toHaveText('900');
  await t.section.getByRole('button', { name: 'Inspect tree filtered CSV', exact: true }).click();
  await expect(t.section.locator('[data-fixture="tree-export-count"]')).toHaveText('900');
  await bottom(t.viewport, t.rows, 'string:leaf-299');
  await expect.poll(() => t.rows.count()).toBeLessThan(40);
  await t.table.getByRole('searchbox', { name: 'Filter loaded rows', exact: true }).fill('');
  await expect(t.section.locator('[data-fixture="tree-visible-count"]')).toHaveText('2100');
  await expect(t.section.locator('[data-fixture="tree-selected-count"]')).toHaveText('900');
  await filled(t.viewport);
});
test('preserves a real child custom-editor through host collapse and distant scrolling, then saves canonical parent metadata', async ({
  page,
}) => {
  const t = await hierarchyFixture(page);
  await t.table.getByRole('button', { name: 'Expand all rows', exact: true }).click();
  await bottom(t.viewport, t.rows, 'string:node-299-4');
  await t.table
    .locator('tr[data-virtual-row-id="string:node-299-4"]')
    .getByRole('button', { name: 'Edit Name', exact: true })
    .click();
  const input = t.table.locator('[data-fixture="custom-editor"] input');
  await input.fill('Protected tree child');
  await input.evaluate((element) => element.setAttribute('data-tree-preserved-editor', 'true'));
  await t.section.getByRole('button', { name: 'Collapse tree from host', exact: true }).click();
  await expect(t.section.locator('[data-fixture="tree-expanded"]')).toHaveText('[]');
  // Wait for the native row-model reflow and protected ancestor branch before a new scroll intent.
  await expect(t.section.locator('[data-fixture="tree-visible-count"]')).toHaveText('305');
  await expect(input).toHaveAttribute('data-tree-preserved-editor', 'true');
  await expect(input).toHaveValue('Protected tree child');
  await input.evaluate((element) => element.focus({ preventScroll: true }));
  await t.viewport.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect.poll(async () => (await geometry(t.viewport)).visible[0]).toBe('number:0');
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute('data-tree-preserved-editor', 'true');
  await expect.poll(() => t.rows.count()).toBeLessThan(40);
  await t.table.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(t.section.locator('[data-fixture="tree-write-count"]')).toHaveText('1');
  await expect(t.section.locator('[data-fixture="tree-saved-id"]')).toHaveText('node-299-4');
  await expect(t.section.locator('[data-fixture="tree-saved-parent"]')).toHaveText('root-299');
  await expect(t.section.locator('[data-fixture="tree-saved-name"]')).toHaveText(
    'Protected tree child',
  );
  await expect(t.section.locator('[data-fixture="tree-row-count"]')).toHaveText('2100');
  await filled(t.viewport);
});
