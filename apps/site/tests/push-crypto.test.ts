import { describe, expect, it } from 'vitest';

import { fromBase64url, toBase64url } from '../worker/push/bytes';
import { encryptMessage, importBrowserKey } from '../worker/push/encrypt';
import { PKCS8_PREFIX, TOKEN_SECONDS, loadVapid, vapidAuthorization } from '../worker/push/vapid';
import { TEST_VAPID, decryptPush, makeBrowser, vapidClaims } from './support/push';

// The worked example of RFC 8291 (Web Push encryption), section 5 and
// appendix A: the keys, the salt and the message the RFC encrypts, and the
// exact bytes it says come out.
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  authSecret: 'BTBZMqHH6r4Tts7J_aSIgg', // gitleaks:allow (RFC 8291 test value)
  receiverPublic:
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  receiverPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94', // gitleaks:allow (RFC 8291 test key)
  senderPublic:
    'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  senderPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', // gitleaks:allow (RFC 8291 test key)
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  message:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

const bytes = (base64url: string): Uint8Array<ArrayBuffer> => {
  const decoded = fromBase64url(base64url);
  if (!decoded) throw new Error(`not base64url: ${base64url}`);
  return decoded;
};

/** A P-256 key from its private scalar and uncompressed public point. */
async function importPair(
  privateB64: string,
  publicB64: string,
  usage: 'ecdh' | 'ecdsa',
): Promise<CryptoKeyPair> {
  const point = bytes(publicB64);
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: toBase64url(point.slice(1, 33)),
    y: toBase64url(point.slice(33, 65)),
  };
  const algorithm =
    usage === 'ecdh'
      ? { name: 'ECDH', namedCurve: 'P-256' }
      : { name: 'ECDSA', namedCurve: 'P-256' };
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    { ...jwk, d: privateB64 },
    algorithm,
    true,
    usage === 'ecdh' ? ['deriveBits'] : ['sign'],
  );
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    algorithm,
    true,
    usage === 'ecdh' ? [] : ['verify'],
  );
  return { privateKey, publicKey };
}

describe('web push encryption (RFC 8291)', () => {
  it('produces the RFC’s example message byte for byte', async () => {
    const serverKeys = await importPair(RFC.senderPrivate, RFC.senderPublic, 'ecdh');
    const encrypted = await encryptMessage(
      new TextEncoder().encode(RFC.plaintext),
      { p256dh: RFC.receiverPublic, auth: RFC.authSecret },
      { serverKeys, salt: bytes(RFC.salt) },
    );
    expect(toBase64url(encrypted)).toBe(RFC.message);
  });

  it('writes the 86-byte aes128gcm header: salt, record size 4096, and its own public key', async () => {
    const browser = await makeBrowser();
    const encrypted = await encryptMessage(new TextEncoder().encode('hello'), browser.keys);
    expect(new DataView(encrypted.buffer).getUint32(16)).toBe(4096);
    expect(encrypted[20]).toBe(65);
    expect(encrypted[21]).toBe(0x04);
    // Header, the message and its padding delimiter, and the 16-byte tag.
    expect(encrypted.length).toBe(86 + 5 + 1 + 16);
  });

  it('can be read by the browser it was made for, with a new key and salt every time', async () => {
    const browser = await makeBrowser();
    const plaintext = new TextEncoder().encode('{"title":"Day 3 of 8"}');
    const first = await encryptMessage(plaintext, browser.keys);
    const second = await encryptMessage(plaintext, browser.keys);
    expect(await decryptPush(first, browser)).toBe('{"title":"Day 3 of 8"}');
    expect(await decryptPush(second, browser)).toBe('{"title":"Day 3 of 8"}');
    expect(toBase64url(first.slice(0, 16))).not.toBe(toBase64url(second.slice(0, 16)));
    expect(toBase64url(first.slice(21, 86))).not.toBe(toBase64url(second.slice(21, 86)));
  });

  it('refuses browser keys that are not a P-256 point and a 16-byte secret', async () => {
    const browser = await makeBrowser();
    const plaintext = new Uint8Array([1]);
    await expect(
      encryptMessage(plaintext, { ...browser.keys, auth: toBase64url(new Uint8Array(8)) }),
    ).rejects.toThrow();
    const offCurve = new Uint8Array(65).fill(7);
    offCurve[0] = 0x04;
    expect(await importBrowserKey(toBase64url(offCurve))).toBeNull();
    expect(await importBrowserKey('not a key')).toBeNull();
  });
});

describe('VAPID (RFC 8292)', () => {
  it('works out the public key from the private key alone', async () => {
    const vapid = await loadVapid({
      ASSETS: {} as Fetcher,
      VAPID_PRIVATE_KEY: TEST_VAPID.privateKey,
    });
    expect(vapid?.publicKey).toBe(TEST_VAPID.publicKey);
    expect(vapid?.publicKey).toHaveLength(87);
    expect(vapid?.subject).toBe('mailto:wwd@lasvegasfortransit.org');
  });

  it('wraps the key in strict DER, as the Workers runtime requires', () => {
    // SEQUENCE, then its length in one byte: the rest of the prefix and the key.
    expect(PKCS8_PREFIX[0]).toBe(0x30);
    expect(PKCS8_PREFIX[1]).toBe(PKCS8_PREFIX.length - 2 + 32);
    // The key's own OCTET STRING, 32 bytes, closes the prefix.
    expect([...PKCS8_PREFIX.slice(-2)]).toEqual([0x04, 0x20]);
  });

  it('turns reminders off when the key is missing or is not a private key', async () => {
    const env = { ASSETS: {} as Fetcher };
    expect(await loadVapid(env)).toBeNull();
    expect(await loadVapid({ ...env, VAPID_PRIVATE_KEY: 'too-short' })).toBeNull();
    // Every byte 0xff is larger than the curve's order, so it is no key at all.
    const tooBig = toBase64url(new Uint8Array(32).fill(0xff));
    expect(await loadVapid({ ...env, VAPID_PRIVATE_KEY: tooBig })).toBeNull();
  });

  it('signs a token for the push service’s origin that its public key verifies', async () => {
    const vapid = await loadVapid({
      ASSETS: {} as Fetcher,
      VAPID_PRIVATE_KEY: TEST_VAPID.privateKey,
      VAPID_SUBJECT: 'mailto:wwd@lasvegasfortransit.org',
    });
    if (!vapid) throw new Error('no VAPID keys');
    const now = new Date('2026-10-03T15:01:00Z');
    const header = await vapidAuthorization(vapid, 'https://fcm.googleapis.com', now);
    expect(header).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]{87}$/);
    expect(header.endsWith(`k=${TEST_VAPID.publicKey}`)).toBe(true);

    const claims = vapidClaims(new Headers({ Authorization: header }));
    expect(claims.aud).toBe('https://fcm.googleapis.com');
    expect(claims.sub).toBe('mailto:wwd@lasvegasfortransit.org');
    expect(claims.exp).toBe(now.getTime() / 1000 + TOKEN_SECONDS);
    expect(TOKEN_SECONDS).toBeLessThanOrEqual(12 * 60 * 60);

    const [head, body, signature] = (/t=([^,]+)/.exec(header)?.[1] ?? '').split('.');
    const { publicKey } = await importPair(TEST_VAPID.privateKey, TEST_VAPID.publicKey, 'ecdsa');
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      bytes(signature ?? ''),
      new TextEncoder().encode(`${head ?? ''}.${body ?? ''}`),
    );
    expect(valid).toBe(true);
  });
});
