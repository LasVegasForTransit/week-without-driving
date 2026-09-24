/**
 * Byte helpers for web push: base64url both ways, and joining byte arrays.
 * Each returns bytes on their own ArrayBuffer, which Web Crypto requires.
 */

type Bytes = Uint8Array<ArrayBuffer>;

export function toBase64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The bytes of a base64url string (padding allowed), or null when it isn't one. */
export function fromBase64url(text: string): Bytes | null {
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(text)) return null;
  const plain = text.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  if (plain.length % 4 === 1) return null;
  try {
    const binary = atob(plain + '='.repeat((4 - (plain.length % 4)) % 4));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

export function concat(...parts: Uint8Array[]): Bytes {
  const joined = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) {
    joined.set(part, at);
    at += part.length;
  }
  return joined;
}

export const utf8 = (text: string): Bytes => new Uint8Array(new TextEncoder().encode(text));
