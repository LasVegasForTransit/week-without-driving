/**
 * Session and link tokens. A token is 32 random bytes in base64url, and the
 * database keeps only its SHA-256 hash, so a copy of the database cannot
 * sign anyone in.
 */

export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function newToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** A short random hex string, for photo file names. */
export function randomHex(bytes: number): string {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** The SHA-256 of some text, as lowercase hex. */
export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return hex(new Uint8Array(digest));
}
