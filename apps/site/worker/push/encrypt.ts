import { concat, fromBase64url, utf8 } from './bytes';

/**
 * Web Push message encryption (RFC 8291, with the aes128gcm content coding
 * of RFC 8188), in Web Crypto. Only the browser that holds the
 * subscription can read a message; the push service in between cannot.
 *
 * For each message: a new P-256 key pair and a random 16-byte salt; ECDH
 * with the browser's public key (p256dh); HKDF with the browser's auth
 * secret to a content key and nonce; then AES-128-GCM over the message
 * with the one-byte padding delimiter. The result is the 86-byte header
 * (salt, record size, the new public key) followed by the ciphertext.
 */

export interface BrowserKeys {
  /** The browser's P-256 public key, uncompressed, in base64url. */
  p256dh: string;
  /** The browser's 16-byte authentication secret, in base64url. */
  auth: string;
}

/** Fixed inputs, so tests can check the RFC's worked example. Never used when sending. */
export interface FixedInputs {
  serverKeys: CryptoKeyPair;
  salt: Uint8Array;
}

const RECORD_SIZE = 4096;
const PADDING_DELIMITER = 0x02;
const P256 = { name: 'ECDH', namedCurve: 'P-256' } as const;

async function hkdf(
  salt: Uint8Array,
  secret: Uint8Array,
  info: Uint8Array,
  bytes: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    bytes * 8,
  );
  return new Uint8Array(bits);
}

/** The browser's public key as a CryptoKey, or null when it isn't a P-256 point. */
export async function importBrowserKey(p256dh: string): Promise<CryptoKey | null> {
  const raw = fromBase64url(p256dh);
  if (raw?.length !== 65 || raw[0] !== 0x04) return null;
  try {
    return await crypto.subtle.importKey('raw', raw, P256, false, []);
  } catch {
    return null;
  }
}

/** Encrypts one push message for one browser. Throws when its keys are unusable. */
export async function encryptMessage(
  plaintext: Uint8Array,
  browser: BrowserKeys,
  fixed?: FixedInputs,
): Promise<Uint8Array<ArrayBuffer>> {
  const browserPublic = fromBase64url(browser.p256dh);
  const authSecret = fromBase64url(browser.auth);
  const browserKey = await importBrowserKey(browser.p256dh);
  if (!browserPublic || !browserKey || authSecret?.length !== 16) {
    throw new Error('The subscription’s keys are not usable');
  }
  const serverKeys =
    fixed?.serverKeys ??
    ((await crypto.subtle.generateKey(P256, true, ['deriveBits'])) as CryptoKeyPair);
  const serverPublic = new Uint8Array(
    (await crypto.subtle.exportKey('raw', serverKeys.publicKey)) as ArrayBuffer,
  );
  // The Workers types spell the ECDH algorithm's `public` as `$public`;
  // the runtime, like every browser and Node, reads `public`.
  const ecdh = { name: 'ECDH', public: browserKey } as unknown as SubtleCryptoDeriveKeyAlgorithm;
  const shared = new Uint8Array(await crypto.subtle.deriveBits(ecdh, serverKeys.privateKey, 256));

  const keyInfo = concat(utf8('WebPush: info\0'), browserPublic, serverPublic);
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12);

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const record = concat(plaintext, Uint8Array.of(PADDING_DELIMITER));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, record),
  );

  const header = new Uint8Array(16 + 4 + 1 + serverPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = serverPublic.length;
  header.set(serverPublic, 21);
  return concat(header, ciphertext);
}
