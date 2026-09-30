import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Env } from '../worker/env';
import { withSiteKey } from '../worker/pages';

interface ElementHandler {
  element(element: FakeElement): void;
}

class FakeElement {
  attributes = new Map<string, string>();

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string) {
    this.attributes.delete(name);
  }
}

class FakeHTMLRewriter {
  static latest: FakeHTMLRewriter | undefined;
  handlers = new Map<string, ElementHandler>();

  constructor() {
    FakeHTMLRewriter.latest = this;
  }

  on(selector: string, handler: ElementHandler) {
    this.handlers.set(selector, handler);
    return this;
  }

  transform(response: Response) {
    return response;
  }
}

function page(key?: string, secret?: string, delivery: 'resend' | 'preview' | 'none' = 'none') {
  const response = new Response('<!doctype html><html></html>', {
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'public, max-age=0, must-revalidate',
      ETag: '"static-page"',
    },
  });
  const assetRequests: Request[] = [];
  const env = {
    ASSETS: {
      fetch: (request: Request) => {
        assetRequests.push(request);
        return Promise.resolve(response);
      },
    },
    TURNSTILE_SITE_KEY: key,
    TURNSTILE_SECRET: secret,
    RESEND_API_KEY: delivery === 'resend' ? 'local-test-key' : undefined,
    PREVIEW_SHOW_LINKS: delivery === 'preview' ? 'true' : undefined,
  } as unknown as Env;
  return { env, assetRequests };
}

function changed(selector: string, initial: Record<string, string> = {}) {
  const element = new FakeElement();
  element.attributes = new Map(Object.entries(initial));
  const handler = FakeHTMLRewriter.latest?.handlers.get(selector);
  expect(handler, `${selector} should be rewritten`).toBeDefined();
  handler?.element(element);
  return element.attributes;
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeHTMLRewriter.latest = undefined;
});

describe('Turnstile pages', () => {
  it.each([
    ['/sign-up', '[data-signup-form]', '[data-signup-unavailable]'],
    ['/my-week/link', '[data-link-form]', '[data-link-unavailable]'],
  ])(
    'shows an unavailable notice instead of the %s form without a site key',
    async (path, form, notice) => {
      vi.stubGlobal('HTMLRewriter', FakeHTMLRewriter);
      const { env, assetRequests } = page(undefined, 'server-secret');
      const request = new Request(`https://lvwwd.org${path}`, {
        headers: { 'If-None-Match': '"static-page"' },
      });
      const response = await withSiteKey(request, env);

      expect(changed(form).has('hidden')).toBe(true);
      // A cached older script can clear `hidden`; the server's inline style
      // and inert state must continue to block the unavailable form.
      expect(changed(form).get('style')).toBe('display: none !important');
      expect(changed(form).has('inert')).toBe(true);
      expect(changed(notice, { hidden: '' }).has('hidden')).toBe(false);
      expect(assetRequests[0]?.headers.get('If-None-Match')).toBeNull();
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('ETag')).toBeNull();
    },
  );

  it('hides sign-up when the public key exists without the server secret', async () => {
    vi.stubGlobal('HTMLRewriter', FakeHTMLRewriter);
    const { env } = page('public-test-key');
    await withSiteKey(new Request('https://lvwwd.org/sign-up'), env);

    expect(changed('[data-signup-form]').has('hidden')).toBe(true);
    expect(changed('[data-signup-form]').get('style')).toBe('display: none !important');
    expect(changed('[data-signup-unavailable]', { hidden: '' }).has('hidden')).toBe(false);
  });

  it('hides link recovery when email delivery is unavailable', async () => {
    vi.stubGlobal('HTMLRewriter', FakeHTMLRewriter);
    const { env } = page('public-test-key', 'server-secret');
    await withSiteKey(new Request('https://lvwwd.org/my-week/link'), env);

    expect(changed('[data-link-form]').has('hidden')).toBe(true);
    expect(changed('[data-link-form]').get('style')).toBe('display: none !important');
    expect(changed('[data-link-unavailable]', { hidden: '' }).has('hidden')).toBe(false);
  });

  it.each(['resend', 'preview'] as const)(
    'shows link recovery when %s delivery is available',
    async (delivery) => {
      vi.stubGlobal('HTMLRewriter', FakeHTMLRewriter);
      const { env } = page('public-test-key', 'server-secret', delivery);
      await withSiteKey(new Request('https://lvwwd.org/my-week/link'), env);

      expect(changed('[data-turnstile]').get('data-sitekey')).toBe('public-test-key');
      expect(FakeHTMLRewriter.latest?.handlers.has('[data-link-form]')).toBe(false);
    },
  );

  it('keeps both forms usable when the site key is configured', async () => {
    vi.stubGlobal('HTMLRewriter', FakeHTMLRewriter);
    const { env } = page('public-test-key', 'server-secret');
    await withSiteKey(new Request('https://lvwwd.org/sign-up'), env);

    expect(changed('[data-turnstile]').get('data-sitekey')).toBe('public-test-key');
    expect(FakeHTMLRewriter.latest?.handlers.has('[data-signup-form]')).toBe(false);
  });
});
