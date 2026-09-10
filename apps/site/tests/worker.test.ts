import { describe, expect, it } from 'vitest';

import { redirectFor } from '../worker/redirect';

describe('redirectFor', () => {
  it('sends www to the apex, keeping the path and query', () => {
    const response = redirectFor(new Request('https://www.lvwwd.org/?utm_source=x'));
    expect(response?.status).toBe(301);
    expect(response?.headers.get('location')).toBe('https://lvwwd.org/?utm_source=x');
  });

  it('leaves the apex alone', () => {
    expect(redirectFor(new Request('https://lvwwd.org/'))).toBeUndefined();
  });
});
