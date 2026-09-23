import type { Env } from '../env';

/**
 * The Worker's own check of Cloudflare Access, the second lock behind
 * Access itself. Access signs in a volunteer and adds a signed token (a
 * JWT) to every request it lets through, in the Cf-Access-Jwt-Assertion
 * header. The token is good only when it is signed with RS256 by one of
 * the team's public keys, was issued by the team for the admin
 * application (its aud holds ACCESS_AUD), and hasn't expired. The
 * volunteer is the token's email.
 * https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/
 */

interface KeySet {
  keys: Map<string, CryptoKey>;
  fetchedAt: number;
}

type Claims = Record<string, unknown>;

// The team's keys are kept for an hour. A token naming a key we don't have
// fetches them again, at most once a minute, so forged tokens can't make
// the Worker fetch on every request.
const KEYS_FOR_MS = 3_600_000;
const REFETCH_AFTER_MS = 60_000;
// Allowed difference between Cloudflare's clock and ours, for "not before".
const CLOCK_SKEW_S = 60;

const keySets = new Map<string, KeySet>();

/** The team's host name, from a domain written with or without https:// and a slash. */
export function teamHost(domain: string): string {
  return domain
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

function decodeBase64url(segment: string): Uint8Array<ArrayBuffer> {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJson(segment: string): Claims | null {
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(decodeBase64url(segment)));
    return value !== null && typeof value === 'object' ? (value as Claims) : null;
  } catch {
    return null;
  }
}

async function fetchKeys(host: string, now: number): Promise<KeySet> {
  const response = await fetch(`https://${host}/cdn-cgi/access/certs`);
  if (!response.ok) throw new Error(`Access certs answered ${response.status}`);
  const body: { keys?: (JsonWebKey & { kid?: string })[] } = await response.json();
  const keys = new Map<string, CryptoKey>();
  for (const jwk of body.keys ?? []) {
    if (jwk.kty !== 'RSA' || !jwk.kid) continue;
    const { kid, ...material } = jwk;
    const key = await crypto.subtle.importKey(
      'jwk',
      material,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    keys.set(kid, key);
  }
  const set = { keys, fetchedAt: now };
  keySets.set(host, set);
  return set;
}

async function keyFor(host: string, kid: string, now: number): Promise<CryptoKey | null> {
  let set = keySets.get(host);
  const stale = !set || now - set.fetchedAt > KEYS_FOR_MS;
  const unknown = set && !set.keys.has(kid) && now - set.fetchedAt > REFETCH_AFTER_MS;
  if (stale || unknown) set = await fetchKeys(host, now);
  return set?.keys.get(kid) ?? null;
}

function audienceMatches(aud: unknown, expected: string): boolean {
  return Array.isArray(aud) ? aud.includes(expected) : aud === expected;
}

/** The volunteer's email when the claims are for this team and application, and current. */
function emailFrom(claims: Claims, host: string, audience: string, now: Date): string | null {
  const seconds = now.getTime() / 1000;
  const { aud, iss, exp, nbf, email } = claims;
  if (!audienceMatches(aud, audience) || iss !== `https://${host}`) return null;
  if (typeof exp !== 'number' || exp <= seconds) return null;
  if (typeof nbf === 'number' && nbf > seconds + CLOCK_SKEW_S) return null;
  return typeof email === 'string' && email.includes('@') ? email.trim().toLowerCase() : null;
}

async function verify(token: string, env: Env, now: Date): Promise<string | null> {
  const domain = env.ACCESS_TEAM_DOMAIN;
  const audience = env.ACCESS_AUD;
  if (!domain || !audience) return null;
  const [head = '', body = '', signature = '', ...rest] = token.split('.');
  if (rest.length > 0) return null;
  const header = decodeJson(head);
  const claims = decodeJson(body);
  if (header?.alg !== 'RS256' || typeof header.kid !== 'string' || !claims) return null;
  const host = teamHost(domain);
  const email = emailFrom(claims, host, audience, now);
  if (!email) return null;
  const key = await keyFor(host, header.kid, now.getTime());
  if (!key) return null;
  const signed = new TextEncoder().encode(`${head}.${body}`);
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    decodeBase64url(signature),
    signed,
  );
  return valid ? email : null;
}

/**
 * The signed-in volunteer's email from the request's Access token, or null
 * when there is no token or it fails any check.
 */
export async function accessEmail(request: Request, env: Env, now: Date): Promise<string | null> {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return null;
  try {
    return await verify(token, env, now);
  } catch (error) {
    // The token itself is never logged.
    console.error('Checking the Access token failed', error);
    return null;
  }
}
