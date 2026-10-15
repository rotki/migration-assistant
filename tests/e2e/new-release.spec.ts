import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

/*
 * A release replaces every hashed asset, so a tab opened before it asks for chunks that are
 * gone. These answer such a request with 404, as GitHub Pages does after a deploy.
 */

test('reloads once when a page chunk from the previous release is gone', async ({ page }) => {
  let missing = 1;
  await page.route(/\/assets\/ConvertPage-[\w-]+\.js$/, async (route) => {
    if (missing-- > 0)
      await route.fulfill({ status: 404, body: '' });
    else
      await route.continue();
  });
  await page.goto('');
  const reloaded = page.waitForEvent('load');
  await page.getByRole('link', { name: /convert/i }).first().click();
  await reloaded;
  await expect(page.getByTestId('wizard-next')).toBeVisible();
});

test('does not reload in a loop when the chunk stays missing', async ({ page }) => {
  await page.route(/\/assets\/ConvertPage-[\w-]+\.js$/, async route => route.fulfill({ status: 404, body: '' }));
  let loads = 0;
  page.on('load', () => {
    loads++;
  });
  await page.goto('');
  await page.getByRole('link', { name: /convert/i }).first().click();
  await page.waitForTimeout(1500);
  // The first load, then one reload into the failure that is left to show.
  expect(loads).toBe(2);
});

test('asks to reload when the converter worker of the previous release is gone', async ({ page }) => {
  await page.route(/\/assets\/convert\.worker-[\w-]+\.js$/, async route => route.fulfill({ status: 404, body: '' }));
  await page.goto('convert');
  await page.locator('input[type=file]:not([data-testid=recipe-file])').setInputFiles(fileURLToPath(new URL('fixtures/kraken-trades.csv', import.meta.url)));
  for (let step = 0; step < 5; step++)
    await page.getByTestId('wizard-next').click();
  await page.getByTestId('start-conversion').click();
  await expect(page.getByText('A new version of this page is out')).toBeVisible();
});
