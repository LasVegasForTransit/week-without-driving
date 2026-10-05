import type { Env } from '../env';

/** Enabling texts also requires a verified sender and a successful phone test. */
export function smsConfigured(env: Env): boolean {
  return (
    env.SMS_REMINDERS_ENABLED === 'true' &&
    /^https:\/\/[a-z\d.-]+(?::\d+)?$/i.test(env.SMS_ORIGIN ?? '') &&
    /^AC[\da-f]{32}$/i.test(env.TWILIO_ACCOUNT_SID ?? '') &&
    Boolean(env.TWILIO_AUTH_TOKEN?.trim()) &&
    /^MG[\da-f]{32}$/i.test(env.TWILIO_MESSAGING_SERVICE_SID ?? '') &&
    /^VA[\da-f]{32}$/i.test(env.TWILIO_VERIFY_SERVICE_SID ?? '')
  );
}

interface Reply {
  ok: boolean;
  status: number;
  data: Record<string, unknown>;
}

/** The two Twilio APIs used here; callers cannot provide an arbitrary URL. */
export async function twilioRequest(
  env: Env,
  action: 'Verifications' | 'VerificationCheck' | 'Messages',
  fields: Record<string, string>,
): Promise<Reply> {
  const url =
    action === 'Messages'
      ? `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`
      : `https://verify.twilio.com/v2/Services/${env.TWILIO_VERIFY_SERVICE_SID}/${action}`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(fields),
      signal: AbortSignal.timeout(8_000),
    });
    const data: unknown = await response.json();
    return {
      ok: response.ok,
      status: response.status,
      data:
        data && typeof data === 'object' && !Array.isArray(data)
          ? (data as Record<string, unknown>)
          : {},
    };
  } catch {
    // Never log provider bodies, phone numbers, tokens, or private links.
    console.error('Twilio could not complete an SMS request');
    return { ok: false, status: 0, data: {} };
  }
}
