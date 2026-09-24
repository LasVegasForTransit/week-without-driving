import { concat, fromBase64url, toBase64url } from '../../worker/push/bytes';

/**
 * A stand-in browser for the web push tests: a P-256 key pair and an auth
 * secret like the ones a browser makes when it subscribes, a way to read
 * a push message the way the browser would (RFC 8291), and a stand-in
 * push service that records what the Worker sends it.
 */

export interface TestBrowser {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  privateKey: CryptoKey;
}

const P256 = { name: 'ECDH', namedCurve: 'P-256' } as const;

let made = 0;

/** A new browser subscription at a push service (Chrome's by default). */
export async function makeBrowser(
  service = 'https://fcm.googleapis.com/fcm/send/',
): Promise<TestBrowser> {
  const pair = await crypto.subtle.generateKey(P256, true, ['deriveBits']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  made += 1;
  return {
    endpoint: `${service}browser-${made}-${crypto.randomUUID()}`,
    keys: {
      p256dh: toBase64url(raw),
      auth: toBase64url(crypto.getRandomValues(new Uint8Array(16))),
    },
    privateKey: pair.privateKey,
  };
}

async function hkdf(
  salt: Uint8Array<ArrayBuffer>,
  secret: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  bytes: number,
) {
  const key = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8),
  );
}

const text = (value: string) => new TextEncoder().encode(value);

/** Reads an aes128gcm push message as the browser would, with its private key. */
export async function decryptPush(
  body: Uint8Array<ArrayBuffer>,
  browser: { privateKey: CryptoKey; keys: { p256dh: string; auth: string } },
): Promise<string> {
  const salt = body.slice(0, 16);
  const idLength = body[20] ?? 0;
  const serverPublic = body.slice(21, 21 + idLength);
  const ciphertext = body.slice(21 + idLength);
  const serverKey = await crypto.subtle.importKey('raw', serverPublic, P256, false, []);
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: serverKey }, browser.privateKey, 256),
  );
  const browserPublic = fromBase64url(browser.keys.p256dh) ?? new Uint8Array();
  const auth = fromBase64url(browser.keys.auth) ?? new Uint8Array();
  const ikm = await hkdf(
    auth,
    shared,
    concat(text('WebPush: info\0'), browserPublic, serverPublic),
    32,
  );
  const cek = await hkdf(salt, ikm, text('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, text('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const padded = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext),
  );
  const end = padded.lastIndexOf(0x02);
  return new TextDecoder().decode(padded.slice(0, end));
}

/** The reminder a push carries, read as the browser would. */
export async function readReminder(
  push: { body: Uint8Array<ArrayBuffer> } | undefined,
  browser: TestBrowser | undefined,
): Promise<{ title: string; body: string }> {
  if (!push || !browser) throw new Error('No push, or no browser to read it');
  return JSON.parse(await decryptPush(push.body, browser)) as { title: string; body: string };
}

export interface PushRequest {
  endpoint: string;
  headers: Headers;
  body: Uint8Array<ArrayBuffer>;
}

export interface PushService {
  /** Every push the Worker sent, in order. */
  requests: PushRequest[];
  /** The status the service answers for an endpoint; 201 unless set. */
  statusFor: (endpoint: string) => number;
  /** The most pushes that were waiting for an answer at the same moment. */
  mostAtOnce: number;
  /** Wraps fetch: pushes go to the stand-in, everything else to `next`. */
  fetch: (next: typeof fetch) => typeof fetch;
}

const PUSH_HOSTS =
  /^https:\/\/(?:fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[^/]+\.notify\.windows\.com)\//;

export function pushService(): PushService {
  let waiting = 0;
  const service: PushService = {
    requests: [],
    statusFor: () => 201,
    mostAtOnce: 0,
    fetch: (next) => async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (!PUSH_HOSTS.test(url)) return next(input, init);
      waiting += 1;
      service.mostAtOnce = Math.max(service.mostAtOnce, waiting);
      // Answer a moment later, as a real service would, so sends overlap.
      await new Promise((resolve) => setTimeout(resolve, 2));
      waiting -= 1;
      const body = init?.body;
      service.requests.push({
        endpoint: url,
        headers: new Headers(init?.headers),
        body: body instanceof Uint8Array ? new Uint8Array(body) : new Uint8Array(),
      });
      return new Response(null, { status: service.statusFor(url) });
    },
  };
  return service;
}

/** The claims of the VAPID token in a push's Authorization header. */
export function vapidClaims(headers: Headers): { aud: string; exp: number; sub: string } {
  const token = /t=([^,\s]+)/.exec(headers.get('Authorization') ?? '')?.[1] ?? '';
  const claims = fromBase64url(token.split('.')[1] ?? '') ?? new Uint8Array();
  return JSON.parse(new TextDecoder().decode(claims)) as { aud: string; exp: number; sub: string };
}

/** Test VAPID keys: the sender's key pair from RFC 8291's worked example. */
export const TEST_VAPID = {
  privateKey: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', // gitleaks:allow (RFC 8291 test key)
  publicKey:
    'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
};

export const VAPID_ENV = {
  VAPID_PRIVATE_KEY: TEST_VAPID.privateKey,
  VAPID_SUBJECT: 'mailto:wwd@lasvegasfortransit.org',
};
