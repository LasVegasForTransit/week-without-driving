import type { Env } from '../env';

/** Twilio signs the exact callback URL and every form parameter, including future fields. */
async function verified(
  request: Request,
  fields: URLSearchParams,
  token: string,
): Promise<boolean> {
  try {
    const signature = Uint8Array.from(atob(request.headers.get('X-Twilio-Signature') ?? ''), (c) =>
      c.charCodeAt(0),
    );
    const data =
      request.url +
      [...new Set(fields.keys())]
        .sort()
        .map((key) =>
          [...new Set(fields.getAll(key))]
            .sort()
            .map((value) => key + value)
            .join(''),
        )
        .join('');
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(token),
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['verify'],
    );
    return await crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(data));
  } catch {
    return false;
  }
}

function stoppedPhone(fields: URLSearchParams): string | null {
  const stopped =
    fields.get('OptOutType') === 'STOP' ||
    /^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT|REVOKE|OPTOUT)$/i.test(
      fields.get('Body')?.trim() ?? '',
    );
  return stopped
    ? fields.get('From')
    : fields.get('ErrorCode') === '21610'
      ? fields.get('To')
      : null;
}

export async function smsWebhook(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  if (!env.DB || !env.TWILIO_AUTH_TOKEN) return new Response(null, { status: 503 });
  if (!request.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded'))
    return new Response(null, { status: 400 });
  if (Number(request.headers.get('Content-Length') ?? 0) > 8192)
    return new Response(null, { status: 413 });
  const text = await request.text();
  if (text.length > 8192) return new Response(null, { status: 413 });
  const fields = new URLSearchParams(text);
  if (
    !(await verified(request, fields, env.TWILIO_AUTH_TOKEN)) ||
    fields.get('AccountSid') !== env.TWILIO_ACCOUNT_SID ||
    fields.get('MessagingServiceSid') !== env.TWILIO_MESSAGING_SERVICE_SID
  )
    return new Response(null, { status: 403 });
  const phone = stoppedPhone(fields);
  if (phone)
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sms_subscriptions WHERE phone = ?1').bind(phone),
      env.DB.prepare('DELETE FROM sms_verifications WHERE phone = ?1').bind(phone),
    ]);
  // Advanced Opt-Out sends its own STOP/HELP response. Do not send a second one.
  return new Response('<Response/>', {
    headers: { 'Content-Type': 'text/xml', 'Cache-Control': 'no-store' },
  });
}
