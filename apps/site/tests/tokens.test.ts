import { describe, expect, it } from 'vitest';

import {
  FLAG_COOKIE,
  SESSION_COOKIE,
  readCookie,
  signInCookies,
  signOutCookies,
} from '../worker/cookies';
import { sniffImage } from '../worker/api/photo';
import { TOKEN_PATTERN, newToken, sha256 } from '../worker/tokens';

describe('tokens', () => {
  it('makes 32 random bytes in base64url, different every time', () => {
    const tokens = new Set(Array.from({ length: 50 }, newToken));
    expect(tokens.size).toBe(50);
    for (const token of tokens) expect(token).toMatch(TOKEN_PATTERN);
  });

  it('hashes with SHA-256', async () => {
    expect(await sha256('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('cookies', () => {
  it('keeps the session cookie from page scripts, and the flag readable', () => {
    const [session, flag] = signInCookies('token');
    expect(session?.startsWith(`${SESSION_COOKIE}=token;`)).toBe(true);
    expect(session).toMatch(/; HttpOnly/);
    expect(flag?.startsWith(`${FLAG_COOKIE}=1;`)).toBe(true);
    expect(flag).not.toMatch(/HttpOnly/);
  });

  it('keeps both cookies until the data is deleted', () => {
    for (const cookie of signInCookies('token')) {
      expect(cookie).toContain('Expires=Tue, 01 Dec 2026 08:00:00 GMT');
      expect(cookie).toMatch(/; Secure/);
      expect(cookie).toMatch(/; SameSite=Lax/);
      expect(cookie).toMatch(/; Path=\//);
    }
  });

  it('clears both cookies on sign-out', () => {
    const cleared = signOutCookies();
    expect(cleared).toHaveLength(2);
    for (const cookie of cleared) expect(cookie).toMatch(/Max-Age=0/);
  });

  it('reads one cookie out of the header', () => {
    const request = new Request('https://lvwwd.org/', {
      headers: { Cookie: `theme=dark; ${SESSION_COOKIE}=abc; ${FLAG_COOKIE}=1` },
    });
    expect(readCookie(request, SESSION_COOKIE)).toBe('abc');
    expect(readCookie(request, 'missing')).toBeNull();
  });
});

describe('sniffImage', () => {
  const bytes = (...values: (number | string)[]) =>
    new Uint8Array(
      values.flatMap((value) =>
        typeof value === 'number' ? [value] : [...new TextEncoder().encode(value)],
      ),
    );

  it('knows the photo types phones take', () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))?.type).toBe('image/jpeg');
    expect(sniffImage(bytes(0x89, 'PNG\r\n', 0x1a, '\n'))?.type).toBe('image/png');
    expect(sniffImage(bytes('RIFF', 0, 0, 0, 0, 'WEBP'))?.type).toBe('image/webp');
    expect(sniffImage(bytes(0, 0, 0, 24, 'ftypheic'))?.type).toBe('image/heic');
    expect(sniffImage(bytes(0, 0, 0, 24, 'ftypmif1'))?.type).toBe('image/heif');
  });

  it('refuses anything else, whatever it is called', () => {
    expect(sniffImage(bytes('<svg xmlns='))).toBeNull();
    expect(sniffImage(bytes('GIF89a'))).toBeNull();
    expect(sniffImage(bytes(0, 0, 0, 24, 'ftypisom'))).toBeNull();
  });
});
