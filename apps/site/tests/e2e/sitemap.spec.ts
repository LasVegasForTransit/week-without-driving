import { expect, test } from '@playwright/test';

const siteOrigin = 'https://lvwwd.org';

test('robots.txt points crawlers at the sitemap index', async ({ request }) => {
  const response = await request.get('/robots.txt');

  expect(response.status()).toBe(200);
  expect(await response.text()).toMatch(/^Sitemap: https:\/\/lvwwd\.org\/sitemap-index\.xml$/m);
});

test('every sitemap URL serves its canonical indexable page without a redirect', async ({
  page,
  request,
}) => {
  const indexResponse = await request.get('/sitemap-index.xml');
  expect(indexResponse.status()).toBe(200);

  const indexXml = await indexResponse.text();
  const sitemapUrls = [...indexXml.matchAll(/<loc>([^<]+)<\/loc>/g)].flatMap((match) =>
    match[1] ? [match[1]] : [],
  );
  expect(sitemapUrls).toHaveLength(1);

  const sitemapPath = new URL(sitemapUrls[0] ?? '').pathname;
  const sitemapResponse = await request.get(sitemapPath);
  expect(sitemapResponse.status()).toBe(200);

  const urls = [...(await sitemapResponse.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].flatMap(
    (match) => (match[1] ? [match[1]] : []),
  );
  expect(urls).toHaveLength(21);

  for (const url of urls) {
    const target = new URL(url);
    expect(target.origin).toBe(siteOrigin);

    const response = await request.get(target.pathname, { maxRedirects: 0 });
    expect(response.status(), `${url} should return 200 without redirect`).toBe(200);

    await page.goto(target.pathname);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', url);
    const robots = await page
      .locator('meta[name="robots"]')
      .evaluateAll((metas) => metas.map((meta) => meta.getAttribute('content') ?? ''));
    expect(robots.join(' ')).not.toMatch(/noindex/i);
    expect(response.headers()['x-robots-tag'] ?? '').not.toMatch(/noindex/i);
  }
});
