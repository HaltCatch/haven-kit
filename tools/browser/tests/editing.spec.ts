import { test, expect, fixture, filled, bottom, geometry } from './support';

test('keeps a custom editor, focus and canonical CAS through distant scroll and rendering mode changes', async ({
  page,
}) => {
  const t = await fixture(page);
  await t.viewport.evaluate((element) => {
    element.scrollTop = 50000;
  });
  await filled(t.viewport);
  const id = (await geometry(t.viewport)).visible[0]!;
  const row = t.table.locator(`tr[data-virtual-row-id="${id}"]`);
  await row.getByRole('button', { name: 'Edit Name', exact: true }).click();
  const input = t.table.locator('[data-fixture="custom-editor"] input');
  await input.fill('Browser-owned pending draft');
  await input.evaluate((element) => {
    element.setAttribute('data-preserved-editor', 'true');
  });
  await bottom(t.viewport, t.rows, 'number:4999');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('Browser-owned pending draft');
  await expect(input).toHaveAttribute('data-preserved-editor', 'true');
  await expect.poll(() => t.rows.count()).toBeLessThan(40);
  await page.getByRole('button', { name: 'Toggle virtual', exact: true }).click();
  await expect(input).toHaveValue('Browser-owned pending draft');
  await expect(input).toHaveAttribute('data-preserved-editor', 'true');
  await page.getByRole('button', { name: 'Toggle virtual', exact: true }).click();
  await expect(input).toHaveAttribute('data-preserved-editor', 'true');
  await input.focus();
  await t.table.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.locator('[data-fixture="write-count"]')).toHaveText('1');
  await expect(t.table.locator(`tr[data-virtual-row-id="${id}"]`)).toContainText(
    'Browser-owned pending draft',
  );
  await filled(t.viewport);
  await expect.poll(async () => (await geometry(t.viewport)).visible).toContain(id);
});

test('bounds 50000-row scrolling and exports the native collection rather than the DOM window', async ({
  page,
  browser,
}, info) => {
  const t = await fixture(page),
    started = Date.now();
  await page.getByRole('button', { name: 'Load large data', exact: true }).click();
  await expect(page.locator('[data-fixture="row-count"]')).toHaveText('50000');
  await filled(t.viewport);
  const loadMs = Date.now() - started;
  const frames = await t.viewport.evaluate(async (element) => {
    const deltas: number[] = [];
    let previous = performance.now(),
      maxRows = 0;
    for (let frame = 0; frame < 24; frame++) {
      const next = await new Promise<number>((resolve) => requestAnimationFrame(resolve));
      deltas.push(next - previous);
      previous = next;
      element.scrollTop = (element.scrollHeight - element.clientHeight) * ((frame + 1) / 24);
      maxRows = Math.max(maxRows, element.querySelectorAll('tr[data-virtual-row-id]').length);
    }
    return { deltas, maxRows };
  });
  expect(frames.maxRows).toBeLessThan(40);
  await bottom(t.viewport, t.rows, 'number:49999');
  await expect(t.table.getByRole('table')).toHaveAttribute('aria-rowcount', '50002');
  await expect(
    t.table.getByRole('button', { name: 'Export current expanded collection', exact: true }),
  ).toBeVisible();
  // Exercise the real public CSV API without writing a large download on every browser run.
  await page.getByRole('button', { name: 'Inspect CSV', exact: true }).click();
  await expect(page.locator('[data-fixture="export-status"]')).toHaveText('ready');
  await expect(page.locator('[data-fixture="export-count"]')).toHaveText('50000');
  await expect(page.locator('[data-fixture="export-edges"]')).toHaveText('true');
  const sorted = [...frames.deltas].sort((a, b) => a - b);
  await info.attach('synthetic-browser-metrics.json', {
    body: JSON.stringify({
      browser: info.project.name,
      browserVersion: browser.version(),
      viewport: page.viewportSize(),
      build: 'production',
      loadScope: 'Replace 5000 warmed rows with 50000 local rows; excludes application startup',
      rows: 50000,
      loadMs,
      maxDomRows: frames.maxRows,
      frameP95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
      frameSamples: sorted.length,
      scope: 'This machine, production test fixture; not a general performance guarantee',
    }),
    contentType: 'application/json',
  });
});
