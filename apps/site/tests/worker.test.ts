import { describe, expect, it } from 'vitest';

import { redirectFor } from '../worker/redirect';

const destination = (url: string, method = 'GET') => {
  const response = redirectFor(new Request(url, { method }));
  return response ? { status: response.status, location: response.headers.get('location') } : null;
};

describe('redirectFor', () => {
  it('sends www to the apex, keeping the path and query', () => {
    expect(destination('https://www.lvwwd.org/?utm_source=x')).toEqual({
      status: 301,
      location: 'https://lvwwd.org/?utm_source=x',
    });
    expect(destination('https://www.lvwwd.org/bingo')?.location).toBe('https://lvwwd.org/bingo');
  });

  it('leaves the apex alone', () => {
    expect(redirectFor(new Request('https://lvwwd.org/'))).toBeUndefined();
    expect(redirectFor(new Request('https://lvwwd.org/?ref=a-group'))).toBeUndefined();
  });

  it('sends the old /wwd address to Home in one step', () => {
    for (const url of [
      'https://lvwwd.org/wwd',
      'https://lvwwd.org/wwd/',
      'https://www.lvwwd.org/wwd/',
    ]) {
      expect(destination(url)).toEqual({ status: 301, location: 'https://lvwwd.org/' });
    }
  });

  it('drops the slash at the end of a page address, keeping the query', () => {
    expect(destination('https://lvwwd.org/bingo/')).toEqual({
      status: 301,
      location: 'https://lvwwd.org/bingo',
    });
    expect(destination('https://lvwwd.org/giveaway/?ref=a-group')?.location).toBe(
      'https://lvwwd.org/giveaway?ref=a-group',
    );
    expect(destination('https://lvwwd.org/guides/heat/', 'HEAD')?.location).toBe(
      'https://lvwwd.org/guides/heat',
    );
    expect(destination('https://www.lvwwd.org/partners/')?.location).toBe(
      'https://lvwwd.org/partners',
    );
  });

  it('keeps redirects on the host that was asked, apart from www', () => {
    expect(destination('https://lvwwd-api-preview.example.workers.dev/wwd')?.location).toBe(
      'https://lvwwd-api-preview.example.workers.dev/',
    );
  });

  it('never redirects the API, the admin views or a form being sent', () => {
    expect(redirectFor(new Request('https://lvwwd.org/api/me/'))).toBeUndefined();
    expect(redirectFor(new Request('https://lvwwd.org/admin/'))).toBeUndefined();
    expect(
      redirectFor(new Request('https://lvwwd.org/sign-up/', { method: 'POST' })),
    ).toBeUndefined();
  });

  it('leaves page addresses that match nothing to the page-not-found page', () => {
    expect(redirectFor(new Request('https://lvwwd.org/bingp'))).toBeUndefined();
    expect(redirectFor(new Request('https://lvwwd.org/wwdx'))).toBeUndefined();
  });
});
