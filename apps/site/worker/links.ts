import { signInCookies } from './cookies';
import type { ApiContext, Env, Participant } from './env';
import { LIMITS, overLimit } from './rate-limit';
import { sendLink } from './send';
import { newSession } from './session';
import { SIGNED_IN_UNTIL } from './time';
import { TOKEN_PATTERN, newToken, sha256 } from './tokens';

/**
 * "Open my week" links: https://<host>/my-week?t=<token>. A link signs in
 * whichever phone opens it, as many times as needed, until the data is
 * deleted. That is what lets someone move to a new phone without a
 * password.
 */

type LinkOwner = Pick<Participant, 'id' | 'firstName' | 'contact' | 'contactType'>;

/** Makes a new link for someone, sends it, records it, and returns it. */
async function issueLink(c: ApiContext, owner: LinkOwner): Promise<string> {
  const token = newToken();
  const link = `${c.url.origin}/my-week?t=${token}`;
  const delivery = await sendLink(c.env, owner, link);
  await c.env.DB.prepare(
    `INSERT INTO link_tokens (token_hash, participant_id, channel, delivery, created_at, expires_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  )
    .bind(
      await sha256(token),
      owner.id,
      owner.contactType,
      delivery,
      c.now.toISOString(),
      SIGNED_IN_UNTIL.toISOString(),
    )
    .run();
  return link;
}

/**
 * Sends someone their link without making the page wait on the email
 * service, which also keeps "Get my link" equally quick whether or not the
 * contact matched. The preview Worker waits instead, so it can hand the
 * link back for testers. `limited` applies the per-contact hourly limit;
 * over it, nothing is sent and nothing is said.
 */
export async function deliverLink(
  c: ApiContext,
  owner: LinkOwner,
  limited: boolean,
): Promise<{ previewLink?: string }> {
  const work = (async () => {
    if (limited && (await overLimit(c.env.DB, LIMITS.linkPerContact, owner.contact, c.now))) {
      return undefined;
    }
    return issueLink(c, owner);
  })();
  if (c.env.PREVIEW_SHOW_LINKS === 'true') {
    const link = await work;
    return link ? { previewLink: link } : {};
  }
  c.ctx.waitUntil(
    work.catch((error: unknown) => {
      console.error('Sending a link failed', error);
    }),
  );
  return {};
}

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({
    Location: location,
    'Cache-Control': 'no-store',
    // The address that brought someone here held their link; don't pass it on.
    'Referrer-Policy': 'no-referrer',
  });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 302, headers });
}

/**
 * GET /my-week?t=<token>: signs this phone in and sends it on to My week
 * with the token gone from the address bar. A link that doesn't work goes
 * to "Get my link", which explains.
 */
export async function openLink(request: Request, env: Env, now: Date): Promise<Response> {
  const expired = redirect('/my-week/link?expired=1');
  const token = new URL(request.url).searchParams.get('t') ?? '';
  if (!env.DB || !TOKEN_PATTERN.test(token)) return expired;
  const row = await env.DB.prepare(
    'SELECT participant_id FROM link_tokens WHERE token_hash = ?1 AND expires_at > ?2',
  )
    .bind(await sha256(token), now.toISOString())
    .first<{ participant_id: string }>();
  if (!row) return expired;
  const session = await newSession(env.DB, row.participant_id, now);
  await session.insert.run();
  return redirect('/my-week', signInCookies(session.token));
}
