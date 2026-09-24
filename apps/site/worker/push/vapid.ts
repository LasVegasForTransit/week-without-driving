import type { Env } from '../env';
import { concat, fromBase64url, toBase64url, utf8 } from './bytes';

/**
 * VAPID (RFC 8292): how push services know a notification comes from
 * lvwwd.org. The Worker holds one P-256 private key, VAPID_PRIVATE_KEY,
 * which `pnpm bootstrap --production` generates once. The public key is
 * worked out from it here, so the two can never disagree; browsers get it
 * from GET /api/push/key when they subscribe. Every push carries a token
 * signed with the private key, for that push service, valid for 12 hours.
 *
 * Replacing the private key stops every existing subscription: browsers
 * accept pushes only from the key they subscribed with.
 */

export interface Vapid {
  /** The public key, uncompressed, in base64url (87 characters). */
  publicKey: string;
  privateKey: CryptoKey;
  subject: string;
}

export const DEFAULT_SUBJECT = 'mailto:wwd@lasvegasfortransit.org';

/** How long each signed token is good for. Push services allow up to 24 hours. */
export const TOKEN_SECONDS = 12 * 60 * 60;

const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' } as const;

// The DER of a PKCS #8 P-256 private key without its optional public key,
// up to the 32 bytes of the key itself: the runtime works the public key
// out from the private one on import. Workers accept only strict DER, so
// every length is in its short form (the first two bytes say 67 in all).
export const PKCS8_PREFIX = Uint8Array.from(
  '3041020100301306072a8648ce3d020106082a8648ce3d030107042730250201010420'.match(/../g) ?? [],
  (pair) => parseInt(pair, 16),
);

async function importPrivateKey(secret: string): Promise<Omit<Vapid, 'subject'> | null> {
  const scalar = fromBase64url(secret.trim());
  if (scalar?.length !== 32) return null;
  try {
    const key = await crypto.subtle.importKey('pkcs8', concat(PKCS8_PREFIX, scalar), ECDSA, true, [
      'sign',
    ]);
    const jwk = (await crypto.subtle.exportKey('jwk', key)) as JsonWebKey;
    const x = fromBase64url(jwk.x ?? '');
    const y = fromBase64url(jwk.y ?? '');
    if (x?.length !== 32 || y?.length !== 32) return null;
    // Sign with a copy that can't be exported.
    const privateKey = await crypto.subtle.importKey('jwk', jwk, ECDSA, false, ['sign']);
    return { privateKey, publicKey: toBase64url(concat(Uint8Array.of(0x04), x, y)) };
  } catch {
    return null;
  }
}

// The key is worked out once per secret and kept while this copy of the
// Worker runs; it holds nothing about any request.
let cached: { secret: string; keys: Promise<Omit<Vapid, 'subject'> | null> } | undefined;

/** The VAPID keys, or null when VAPID_PRIVATE_KEY is missing or isn't a P-256 private key. */
export async function loadVapid(env: Env): Promise<Vapid | null> {
  const secret = env.VAPID_PRIVATE_KEY;
  if (!secret) return null;
  if (cached?.secret !== secret) cached = { secret, keys: importPrivateKey(secret) };
  const keys = await cached.keys;
  if (!keys) {
    console.error('VAPID_PRIVATE_KEY is not a P-256 private key, so no reminders can be sent.');
    return null;
  }
  return { ...keys, subject: env.VAPID_SUBJECT ?? DEFAULT_SUBJECT };
}

const encodeJson = (value: object): string => toBase64url(utf8(JSON.stringify(value)));

/**
 * The Authorization header for pushes to one push service: a JWT (ES256)
 * whose audience is the push service's origin, and the public key.
 */
export async function vapidAuthorization(
  vapid: Vapid,
  pushOrigin: string,
  now: Date,
): Promise<string> {
  const unsigned = `${encodeJson({ typ: 'JWT', alg: 'ES256' })}.${encodeJson({
    aud: pushOrigin,
    exp: Math.floor(now.getTime() / 1000) + TOKEN_SECONDS,
    sub: vapid.subject,
  })}`;
  // Web Crypto's ECDSA signature is r and s, 32 bytes each: the JWS form.
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    vapid.privateKey,
    utf8(unsigned),
  );
  return `vapid t=${unsigned}.${toBase64url(new Uint8Array(signature))}, k=${vapid.publicKey}`;
}
