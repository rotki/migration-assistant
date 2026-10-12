import { expect, type Page, test } from '@playwright/test';

/** Every route the site prerenders, relative to the base URL. */
const ROUTES = ['', 'convert'] as const;

const EXTERNAL_URL = 'https://example.com/collect';

interface CspViolation {
  directive: string;
  blockedUri: string;
}

/** Records the CSP violations the page reports from here on. */
async function recordCspViolations(page: Page): Promise<() => Promise<CspViolation[]>> {
  await page.addInitScript(() => {
    const violations: CspViolation[] = [];
    Object.assign(window, { __cspViolations: violations });
    document.addEventListener('securitypolicyviolation', (event) => {
      violations.push({ directive: event.effectiveDirective, blockedUri: event.blockedURI });
    });
  });
  return async (): Promise<CspViolation[]> => {
    const recorded = await page.evaluate(() => JSON.stringify(Reflect.get(window, '__cspViolations')));
    return JSON.parse(recorded);
  };
}

for (const route of ROUTES) {
  test.describe(`/${route}`, () => {
    test('loads only from its own origin', async ({ page, baseURL }) => {
      const origin = new URL(baseURL!).origin;
      const requests: string[] = [];
      page.on('request', request => requests.push(request.url()));

      await page.goto(route, { waitUntil: 'networkidle' });

      expect(requests.length).toBeGreaterThan(0);
      const foreign = requests.filter(url => !url.startsWith('data:') && new URL(url).origin !== origin);
      expect(foreign).toEqual([]);
    });

    test('ships a policy that forbids network requests', async ({ page }) => {
      await page.goto(route);

      const policy = await page
        .locator('meta[http-equiv="Content-Security-Policy"]')
        .getAttribute('content');

      expect(policy).toContain(`connect-src 'none'`);
      expect(policy).toContain(`form-action 'none'`);
    });

    test('renders without breaking its own policy', async ({ page }) => {
      const violations = await recordCspViolations(page);

      await page.goto(route, { waitUntil: 'networkidle' });

      expect(await violations()).toEqual([]);
    });
  });
}

test('blocks a request to another origin before it leaves the browser', async ({ page }) => {
  const violations = await recordCspViolations(page);
  const sent: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith(EXTERNAL_URL))
      sent.push(request.url());
  });

  await page.goto('', { waitUntil: 'networkidle' });
  const outcome = await page.evaluate(async (url) => {
    try {
      await fetch(url, { method: 'POST', body: 'file contents' });
      return 'sent';
    }
    catch {
      return 'blocked';
    }
  }, EXTERNAL_URL);

  expect(outcome).toBe('blocked');
  expect(sent).toEqual([]);
  expect(await violations()).toContainEqual({ directive: 'connect-src', blockedUri: EXTERNAL_URL });
});
