import { signInCookies } from './cookies';
import type { ApiContext, Env, Participant } from './env';
import { LIMITS, overLimit } from './rate-limit';
import { type Delivery, sendLink } from './send';
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

/** Stores a usable link before handing it to the email provider. */
async function issueLink(
  c: ApiContext,
  owner: LinkOwner,
): Promise<{ link: string; delivery: Delivery }> {
  const token = newToken();
  const link = `${c.url.origin}/my-week?t=${token}`;
  const tokenHash = await sha256(token);
  await c.env.DB.prepare(
    `INSERT INTO link_tokens (token_hash, participant_id, channel, delivery, created_at, expires_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  )
    .bind(
      tokenHash,
      owner.id,
      owner.contactType,
      'pending',
      c.now.toISOString(),
      SIGNED_IN_UNTIL.toISOString(),
    )
    .run();
  const delivery = await sendLink(c.env, owner, link);
  try {
    await c.env.DB.prepare('UPDATE link_tokens SET delivery = ?1 WHERE token_hash = ?2')
      .bind(delivery, tokenHash)
      .run();
  } catch (error) {
    // The link is already stored and works even if its delivery status lags.
    console.error('Recording link delivery failed', error);
  }
  return { link, delivery };
}

/**
 * Link recovery sends without making the page wait on the email service,
 * keeping its response equally quick whether or not the contact matched.
 * A new signup waits so it can report a rejected email accurately. The
 * preview Worker also waits to hand the link back to testers. `limited`
 * applies the per-contact hourly limit; over it, nothing is sent or said.
 */
export async function deliverLink(
  c: ApiContext,
  owner: LinkOwner,
  limited: boolean,
  awaitDelivery = false,
): Promise<{ previewLink?: string; delivery?: Delivery }> {
  const work = (async () => {
    if (limited && (await overLimit(c.env.DB, LIMITS.linkPerContact, owner.contact, c.now))) {
      return undefined;
    }
    return issueLink(c, owner);
  })();
  if (c.env.PREVIEW_SHOW_LINKS === 'true' || awaitDelivery) {
    try {
      const result = await work;
      if (!result) return {};
      return {
        ...(c.env.PREVIEW_SHOW_LINKS === 'true' ? { previewLink: result.link } : {}),
        delivery: result.delivery,
      };
    } catch (error) {
      // The signup and its session were committed before link issuance.
      console.error('Issuing a link failed', error);
      return { delivery: 'failed' };
    }
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
