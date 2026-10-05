import type { ApiContext, Env, Participant } from '../env';
import { clientIp, json, problem, readJsonObject } from '../http';
import { LIMITS, overLimit } from '../rate-limit';
import { signedInParticipant } from '../session';
import { checkTurnstile } from '../turnstile';

const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** Provider credentials stay on the Worker; static and unconfigured previews retain the link. */
export function newsletterConfigured(env: Env): boolean {
  return Boolean(
    env.LVBT_BEEHIIV_API_KEY?.trim() &&
    /^pub_[0-9a-f-]+$/i.test(env.LVBT_BEEHIIV_PUBLICATION_ID?.trim() ?? ''),
  );
}

function unavailable(status = 503): Response {
  return problem(status, 'Newsletter signup is unavailable. Please try again later.', {
    error: 'newsletter_unavailable',
  });
}

function chosenEmail(body: Record<string, unknown>, me: Participant | null): string | Response {
  let email: string;
  if (Object.hasOwn(body, 'email')) {
    email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  } else {
    if (body.source !== 'keep_going')
      return problem(400, 'Enter your email address.', { error: 'invalid_email' });
    if (!me) return problem(401, 'Sign in or enter an email address.', { error: 'not_signed_in' });
    email = me.contactType === 'email' ? me.contact : '';
  }
  return email && email.length <= 254 && EMAIL.test(email)
    ? email
    : problem(400, 'Enter a full email address.', { error: 'invalid_email' });
}

async function verifySignup(
  c: ApiContext,
  email: string,
  token: unknown,
): Promise<Response | null> {
  const ip = clientIp(c.request);
  if (await overLimit(c.env.DB, LIMITS.newsletterPerIp, ip, c.now)) {
    return problem(429, 'Too many tries. Wait a minute and try again.', { error: 'rate_limited' });
  }
  const bot = await checkTurnstile(c.env, token, ip);
  if (bot !== 'pass') {
    return problem(bot === 'fail' ? 403 : 503, 'Please retry the bot check.', {
      error: bot === 'fail' ? 'verification_failed' : 'bot_check_unavailable',
    });
  }
  if (await overLimit(c.env.DB, LIMITS.newsletterPerEmail, email, c.now)) {
    return problem(429, 'Too many tries. Try again later.', { error: 'rate_limited' });
  }
  return null;
}

async function subscribe(env: Env, email: string, source: string): Promise<boolean> {
  try {
    const publication = env.LVBT_BEEHIIV_PUBLICATION_ID?.trim();
    const response = await fetch(
      `https://api.beehiiv.com/v2/publications/${publication}/subscriptions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.LVBT_BEEHIIV_API_KEY?.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          reactivate_existing: true,
          send_welcome_email: false,
          double_opt_override: 'on',
          utm_source: 'lvwwd.org',
          utm_medium: 'website',
          utm_campaign: 'week-without-driving-2026',
          utm_content: source,
        }),
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      console.error('Newsletter provider refused signup', response.status);
      return false;
    }
    const result: { data?: { id?: unknown; status?: unknown } } | null = await response.json();
    return (
      typeof result?.data?.id === 'string' &&
      result.data.id.length > 0 &&
      typeof result.data.status === 'string' &&
      ['active', 'pending', 'validating'].includes(result.data.status)
    );
  } catch {
    console.error('Newsletter provider could not complete signup');
    return false;
  }
}

/** An explicit subscription choice, independent of giveaway registration and closing dates. */
export async function joinNewsletter(c: ApiContext): Promise<Response> {
  const body = await readJsonObject(c.request);
  if (!body) return problem(400, 'Enter your email address.', { error: 'invalid_json' });
  if (body.source !== 'home' && body.source !== 'keep_going') {
    return problem(400, 'Reload the page and try again.', { error: 'invalid_source' });
  }
  const me = await signedInParticipant(c.env.DB, c.request, c.now);
  const email = chosenEmail(body, me);
  if (email instanceof Response) return email;
  if (!newsletterConfigured(c.env)) return unavailable();
  const rejected = await verifySignup(c, email, body.turnstileToken);
  if (rejected) return rejected;
  if (!(await subscribe(c.env, email, body.source))) return unavailable(502);

  // This flag records the participant's request, not confirmation in Beehiiv.
  // An alternate address must never alter their campaign contact or its flag.
  if (me?.contactType === 'email' && me.contact === email) {
    try {
      await c.env.DB.prepare('UPDATE participants SET newsletter = 1 WHERE id = ?1')
        .bind(me.id)
        .run();
    } catch {
      // Beehiiv already accepted the request; don't misreport it as a failure.
      console.error('Could not record participant newsletter choice');
    }
  }
  return json({ ok: true });
}
