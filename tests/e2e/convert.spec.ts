import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';

const fixture = (name: string): string => fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));

const EVENTS_HEADER = 'Type,Location,Currency,Amount,Fee,Fee Currency,Description,Timestamp';
const TRADES_HEADER = 'Location,Spend Currency,Spend Amount,Receive Currency,Receive Amount,Fee,Fee Currency,Description,Timestamp';

const LEDGER_EVENTS = [
  EVENTS_HEADER,
  'Deposit,external,ETH,1.5,,,,1709641800000',
  'Withdrawal,external,ETH,0.25,,,to wallet,1709712000000',
  'Staking,external,DOT,0.0123,,,,1709802900000',
  'Income,external,XYZ,5,,,,1710500400000',
  '',
].join('\n');

async function loadCsv(page: Page, name: string): Promise<void> {
  await page.goto('convert');
  await page.locator('input[type=file]:not([data-testid=recipe-file])').setInputFiles(fixture(name));
  await expect(page.getByTestId('detected-settings')).toBeVisible();
}

async function next(page: Page): Promise<void> {
  await page.getByTestId('wizard-next').click();
}

/** Clicks a download link and returns the file's name and text. */
async function download(page: Page, testId: string): Promise<{ name: string; text: string }> {
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByTestId(testId).click()]);
  const path = await file.path();
  return { name: file.suggestedFilename(), text: await readFile(path, 'utf8') };
}

async function convert(page: Page): Promise<void> {
  await page.getByTestId('start-conversion').click();
  await expect(page.getByTestId('conversion-result')).toBeVisible();
}

test('converts a trade export with pairs and sells', async ({ page }) => {
  await loadCsv(page, 'kraken-trades.csv');
  await next(page);
  await expect(page.getByTestId('format-trades')).toHaveAttribute('aria-checked', 'true');
  await next(page);
  await expect(page.getByTestId('swap-section')).toContainText('Some rows are sells');
  await next(page);
  await next(page);
  await expect(page.getByTestId('preview-rejected')).toContainText('Timestamp "not a date"');
  await next(page);
  await convert(page);

  const output = await download(page, 'download-output');
  expect(output.name).toBe('kraken-trades-rotki-trades.csv');
  expect(output.text).toBe([
    TRADES_HEADER,
    'kraken,EUR,30000,XBT,0.5,48,EUR,TX1,1709641815123',
    'kraken,ETH,2,EUR,6401,10.24,EUR,TX2,1709712062000',
    'kraken,USD,650,XBT,0.01,,,TX3,1709855999999',
    '',
  ].join('\n'));

  const rejected = await download(page, 'download-rejected');
  expect(rejected.text).toContain('TX4,O4,DOT/EUR,not a date');
  expect(rejected.text.slice(0, rejected.text.indexOf('\n'))).toBe('txid,ordertxid,pair,time,type,ordertype,price,cost,fee,vol,margin,misc,ledgers,Row,Reason');
});

test('converts a ledger below a preamble into events', async ({ page }) => {
  await loadCsv(page, 'exchange-ledger.csv');
  await expect(page.getByTestId('detected-settings')).toContainText('semicolon');
  await expect(page.getByTestId('detected-settings')).toContainText('row 3');
  await next(page);
  // The ledger's deposits and rewards make events the suggestion, already selected.
  await expect(page.getByTestId('suggested-events')).toBeVisible();
  await expect(page.getByTestId('format-events')).toHaveAttribute('aria-checked', 'true');
  await next(page);
  await expect(page.getByTestId('value-map-Staking Rewards')).toContainText('Staking');
  await expect(page.getByTestId('value-map-unmapped')).toContainText('1 value is not mapped yet');
  await expect(page.getByTestId('location-external')).toBeVisible();
  await next(page);
  await expect(page.getByTestId('amount-readings')).toContainText('0.0123');
  await next(page);
  // Row 7 is the record's place in the file: two preamble lines, the header, then data.
  await expect(page.getByTestId('preview-rejected')).toContainText('Row 7');
  await next(page);
  await expect(page.getByTestId('output-name')).toContainText('exchange-ledger-rotki-events.csv');
  await convert(page);
  await expect(page.getByTestId('conversion-result')).toContainText('4 rows converted');

  const output = await download(page, 'download-output');
  expect(output.text).toBe(LEDGER_EVENTS);
  const rejected = await download(page, 'download-rejected');
  expect(rejected.text).toContain(',7,"Type ""Transfer Between Main and Funding Wallet"" is not a rotki event type');
});

test('a rejected row links to the step that fixes it', async ({ page }) => {
  await loadCsv(page, 'kraken-trades.csv');
  for (let step = 0; step < 4; step++)
    await next(page);
  await expect(page.getByTestId('preview-rejected')).toContainText('does not match the date format ISO 8601');
  await page.getByTestId('fix-5').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dates and numbers');
});

test('the footer carries the copyright', async ({ page }) => {
  await page.goto('');
  await expect(page.getByTestId('copyright')).toHaveText(/© Rotki Solutions GmbH 2026(?:-\d{4})?\./);
});

test('a saved recipe converts the same export with its columns moved', async ({ page }) => {
  await loadCsv(page, 'exchange-ledger.csv');
  await next(page);
  await page.getByTestId('format-events').click();
  for (let step = 0; step < 4; step++)
    await next(page);
  const recipe = await download(page, 'save-recipe');
  expect(JSON.parse(recipe.text)).toMatchObject({ version: 1, format: 'events' });

  await loadCsv(page, 'exchange-ledger-reordered.csv');
  await page.getByTestId('recipe-file').setInputFiles({ name: 'ledger.recipe.json', mimeType: 'application/json', buffer: Buffer.from(recipe.text) });
  for (let step = 0; step < 5; step++)
    await next(page);
  await convert(page);

  const output = await download(page, 'download-output');
  expect(output.text).toBe(LEDGER_EVENTS);
});

test('a recipe that reads a missing column stops with the reason', async ({ page }) => {
  await loadCsv(page, 'exchange-ledger.csv');
  await next(page);
  await page.getByTestId('format-events').click();
  for (let step = 0; step < 4; step++)
    await next(page);
  const recipe = JSON.parse((await download(page, 'save-recipe')).text);
  recipe.fields.Currency.source.column = 'Asset';

  await loadCsv(page, 'exchange-ledger.csv');
  await page.getByTestId('recipe-file').setInputFiles({ name: 'broken.recipe.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(recipe)) });
  await next(page);
  await next(page);
  await expect(page.getByTestId('wizard-blocker')).toHaveText('The file has no column named "Asset".');
});

test('removing the file starts over', async ({ page }) => {
  await loadCsv(page, 'exchange-ledger.csv');
  await expect(page.getByTestId('wizard-next')).toBeEnabled();

  await page.getByRole('button', { name: 'Remove exchange-ledger.csv' }).click();

  await expect(page.getByTestId('detected-settings')).toHaveCount(0);
  await expect(page.getByTestId('wizard-next')).toBeDisabled();
  await expect(page.getByTestId('wizard-blocker')).toHaveText('Choose a CSV file with at least two columns.');
});

test('convert another file starts with an empty upload field', async ({ page }) => {
  await loadCsv(page, 'kraken-trades.csv');
  for (let step = 0; step < 5; step++)
    await next(page);
  await convert(page);
  await page.getByTestId('convert-another').click();

  // A field still holding the last file would ignore picking that same file again.
  await expect(page.locator('input[type=file]:not([data-testid=recipe-file])')).toHaveValue('');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'click to upload' }).click()]);
  await chooser.setFiles(fixture('kraken-trades.csv'));
  await expect(page.getByTestId('detected-settings')).toBeVisible();
});

test('converts a 400,000 row file through the worker', async ({ page }) => {
  const header = 'Date,Type,Asset,Amount\n';
  const rows: string[] = [];
  for (let index = 0; index < 400_000; index++)
    rows.push(`2024-03-05 12:00:00,Deposit,ETH,${index % 1000}.5\n`);
  const buffer = Buffer.from(header + rows.join(''));

  await page.goto('convert');
  await page.locator('input[type=file]:not([data-testid=recipe-file])').setInputFiles({ name: 'large.csv', mimeType: 'text/csv', buffer });
  await next(page);
  await page.getByTestId('format-events').click();
  for (let step = 0; step < 4; step++)
    await next(page);
  await page.getByTestId('start-conversion').click();
  await expect(page.getByTestId('conversion-result')).toContainText('400,000 rows converted', { timeout: 60_000 });
});
