import { ORIGIN, type Platform } from './platform';

/**
 * A stand-in Cloudflare Access for the admin tests: an RSA key pair made
 * in the test, tokens signed with it the way Access signs them, and
 * requests carrying a token the way Access forwards them.
 */

export const TEAM = 'lvbt-test.cloudflareaccess.com';
export const AUD = 'test-admin-aud';
export const VOLUNTEER = 'sam@lvbt.test';
export const ACCESS_ENV = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };

export interface AccessKeys {
  kid: string;
  privateKey: CryptoKey;
  publicJwk: JsonWebKey;
}

export async function makeAccessKeys(kid = 'test-key'): Promise<AccessKeys> {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const exported = await crypto.subtle.exportKey('jwk', pair.publicKey);
  return {
    kid,
    privateKey: pair.privateKey,
    publicJwk: { ...exported, kid, alg: 'RS256', use: 'sig' } as JsonWebKey,
  };
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function encodeJson(value: object): string {
  return base64url(new TextEncoder().encode(JSON.stringify(value)));
}

/** A token as Access would sign it for VOLUNTEER, with any claims changed. */
export async function accessToken(keys: AccessKeys, claims: object = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const head = encodeJson({ alg: 'RS256', kid: keys.kid, typ: 'JWT' });
  const body = encodeJson({
    aud: [AUD],
    email: VOLUNTEER,
    exp: now + 3600,
    iat: now,
    nbf: now,
    iss: `https://${TEAM}`,
    sub: 'volunteer-id',
    type: 'app',
    ...claims,
  });
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    keys.privateKey,
    new TextEncoder().encode(`${head}.${body}`),
  );
  return `${head}.${body}.${base64url(new Uint8Array(signature))}`;
}

export function adminGet(path: string, token?: string, cookie?: string): Request {
  const headers = new Headers();
  if (token) headers.set('Cf-Access-Jwt-Assertion', token);
  if (cookie) headers.set('Cookie', cookie);
  return new Request(`${ORIGIN}${path}`, { headers });
}

export type Fields = Record<string, string | string[]>;

/** A form sent from the admin page, with Access's token. */
export function adminPost(
  path: string,
  fields: Fields,
  options: { token?: string; origin?: string | null } = {},
): Request {
  const body = new URLSearchParams();
  for (const [name, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) body.append(name, item);
  }
  const headers = new Headers();
  if (options.token) headers.set('Cf-Access-Jwt-Assertion', options.token);
  if (options.origin !== null) headers.set('Origin', options.origin ?? ORIGIN);
  return new Request(`${ORIGIN}${path}`, { method: 'POST', headers, body });
}

export interface Admin {
  get(path: string): Promise<Response>;
  post(path: string, fields: Fields): Promise<Response>;
}

/** Sends admin requests as VOLUNTEER, signed in through Access. */
export function adminClient(
  platform: Platform,
  keys: AccessKeys,
  env: Record<string, string> = {},
): Admin {
  return {
    get: async (path) =>
      platform.send(adminGet(path, await accessToken(keys)), { ...ACCESS_ENV, ...env }),
    post: async (path, fields) =>
      platform.send(adminPost(path, fields, { token: await accessToken(keys) }), {
        ...ACCESS_ENV,
        ...env,
      }),
  };
}

/** Where a form sent the volunteer next, and the notice it carries. */
export function noticeOf(response: Response): string | null {
  const location = response.headers.get('Location');
  return location ? new URL(location, ORIGIN).searchParams.get('notice') : null;
}

export interface EntrySeed {
  participantId?: string | null;
  instagram?: string | null;
  day?: number;
  source?: 'post' | 'tag' | 'mail';
  modes?: string;
  hard?: string | null;
  postUrl?: string | null;
  screenshotKey?: string | null;
  checked?: boolean;
  removed?: boolean;
  createdAt?: string;
}

const ENTRY_DEFAULTS = {
  participantId: null,
  instagram: null,
  day: 3,
  source: 'post',
  modes: 'bus',
  hard: null,
  postUrl: 'https://www.instagram.com/p/SEED/',
  screenshotKey: null,
  checked: false,
  removed: false,
  createdAt: '2026-10-03T18:00:00.000Z',
} satisfies Required<EntrySeed>;

/** Puts an entry straight into the database and returns its id. */
export async function seedEntry(platform: Platform, seed: EntrySeed): Promise<number> {
  const entry = { ...ENTRY_DEFAULTS, ...seed };
  const checked = entry.checked ? ['2026-10-04T01:00:00.000Z', 'checker@lvbt.test'] : [null, null];
  const removed = entry.removed
    ? ['2026-10-04T02:00:00.000Z', 'checker@lvbt.test', 'no-trip']
    : [null, null, null];
  const row = await platform.env.DB.prepare(
    `INSERT INTO checkins (participant_id, instagram, day, source, created_at, modes, hard,
       post_url, screenshot_key, checked_at, checked_by, removed_at, removed_by, removal_reason)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14) RETURNING id`,
  )
    .bind(
      entry.participantId,
      entry.instagram,
      entry.day,
      entry.source,
      entry.createdAt,
      entry.modes,
      entry.hard,
      entry.postUrl,
      entry.screenshotKey,
      ...checked,
      ...removed,
    )
    .first<{ id: number }>();
  if (!row) throw new Error('The entry was not saved');
  return row.id;
}

/** Puts a sign-up straight into the database and returns its id. */
export async function seedParticipant(
  platform: Platform,
  person: { firstName?: string; contact: string; instagram?: string | null; createdAt?: string },
): Promise<string> {
  const id = crypto.randomUUID();
  const type = person.contact.includes('@') ? 'email' : 'phone';
  await platform.env.DB.prepare(
    `INSERT INTO participants
       (id, first_name, contact, contact_type, zip, instagram, age, newsletter, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, '89101', ?5, 'adult', 0, ?6, ?6)`,
  )
    .bind(
      id,
      person.firstName ?? 'Ana',
      person.contact,
      type,
      person.instagram ?? null,
      person.createdAt ?? '2026-09-20T00:00:00.000Z',
    )
    .run();
  return id;
}

export async function countRows(platform: Platform, sql: string): Promise<number> {
  const row = await platform.env.DB.prepare(sql).first<{ n: number }>();
  return row?.n ?? 0;
}
