import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PLAN_PUSH_CRONS } from '../worker/push/plans';
import { CLEANUP_CRON } from '../worker/cleanup';
import {
  type Platform,
  ORIGIN,
  apiRequest,
  fakeOutbound,
  signUpAs,
  startPlatform,
} from './support/platform';

const CONFIG = {
  SMS_REMINDERS_ENABLED: 'true',
  SMS_ORIGIN: ORIGIN,
  TWILIO_ACCOUNT_SID: `AC${'a'.repeat(32)}`,
  TWILIO_AUTH_TOKEN: 'test-auth-token',
  TWILIO_MESSAGING_SERVICE_SID: `MG${'b'.repeat(32)}`,
  TWILIO_VERIFY_SERVICE_SID: `VA${'c'.repeat(32)}`,
};
const PHONE = '+17025551234';
const VERIFICATION = `VE${'d'.repeat(32)}`;
const WEBHOOK = `${ORIGIN}/api/sms/webhook`;

describe('confirmed SMS reminders', () => {
  let platform: Platform;
  let cookie: string;
  let calls: Array<{ url: string; body: URLSearchParams }>;
  let approve: boolean;
  let onCheck: (() => Promise<void>) | undefined;
  let messageStatus: number;
  const realFetch = globalThis.fetch;
  beforeAll(async () => {
    platform = await startPlatform();
  }, 60_000);
  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    await platform.dispose();
  });
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-04T19:20:00Z'));
    await platform.reset();
    calls = [];
    approve = true;
    onCheck = undefined;
    messageStatus = 201;
    const outbound = fakeOutbound(realFetch);
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (
        !url.startsWith('https://verify.twilio.com/') &&
        !url.startsWith('https://api.twilio.com/')
      )
        return outbound.fetch(input, init);
      const body = new URLSearchParams(
        typeof init?.body === 'string'
          ? init.body
          : init?.body instanceof URLSearchParams
            ? init.body
            : '',
      );
      calls.push({ url, body });
      if (url.endsWith('/VerificationCheck')) {
        await onCheck?.();
        return Response.json({
          sid: VERIFICATION,
          to: PHONE,
          status: approve ? 'approved' : 'pending',
        });
      }
      if (url.endsWith('/Verifications'))
        return Response.json({ sid: VERIFICATION, to: PHONE, status: 'pending' });
      return Response.json(
        messageStatus === 201 ? { sid: `SM${'e'.repeat(32)}`, status: 'queued' } : { code: 21610 },
        { status: messageStatus },
      );
    });
    cookie = await signUpAs(platform);
  });
  const post = (path: string, body: object = {}, as = cookie) =>
    platform.send(apiRequest('POST', `/api/sms/${path}`, { body, cookie: as }), CONFIG);
  const enroll = async () => {
    expect(
      (await post('request', { phone: PHONE, consent: true, turnstileToken: 'token' })).status,
    ).toBe(200);
    expect((await post('confirm', { code: '123456' })).status).toBe(200);
  };
  const subscriptions = () =>
    platform.env.DB.prepare('SELECT phone FROM sms_subscriptions').all<{ phone: string }>();
  const webhook = (extra: Record<string, string>, signed = true) => {
    const fields = {
      AccountSid: CONFIG.TWILIO_ACCOUNT_SID,
      MessagingServiceSid: CONFIG.TWILIO_MESSAGING_SERVICE_SID,
      From: PHONE,
      ...extra,
    };
    const data =
      WEBHOOK +
      Object.keys(fields)
        .sort()
        .map((key) => key + fields[key as keyof typeof fields])
        .join('');
    const signature = signed
      ? createHmac('sha1', CONFIG.TWILIO_AUTH_TOKEN).update(data).digest('base64')
      : 'incorrect';
    return platform.send(
      new Request(WEBHOOK, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Twilio-Signature': signature,
        },
        body: new URLSearchParams(fields),
      }),
      CONFIG,
    );
  };

  it('requires an explicit choice and confirmation before storing a subscribed number', async () => {
    expect(
      (await post('request', { phone: PHONE, consent: false, turnstileToken: 'token' })).status,
    ).toBe(400);
    expect(calls).toHaveLength(0);
    expect(
      (await post('request', { phone: '(702) 555-1234', consent: true, turnstileToken: 'token' }))
        .status,
    ).toBe(200);
    expect(calls[0]?.body.get('To')).toBe(PHONE);
    expect((await subscriptions()).results).toHaveLength(0);
    approve = false;
    expect((await post('confirm', { code: '000000' })).status).toBe(400);
    expect((await subscriptions()).results).toHaveLength(0);
    approve = true;
    expect((await post('confirm', { code: '123456' })).status).toBe(200);
    expect(calls.at(-1)?.body.get('VerificationSid')).toBe(VERIFICATION);
    expect((await subscriptions()).results).toEqual([{ phone: PHONE }]);
  });

  it('does not let another participant confirm or stop someone else’s number', async () => {
    await enroll();
    const other = await signUpAs(platform, { contact: 'other@example.com' });
    expect((await post('confirm', { code: '123456' }, other)).status).toBe(400);
    expect((await post('unsubscribe', {}, other)).status).toBe(200);
    expect((await subscriptions()).results).toHaveLength(1);
    const status = await platform.send(
      apiRequest('GET', '/api/sms/status', { cookie: other }),
      CONFIG,
    );
    expect(await status.json()).toMatchObject({ subscribed: false });
  });

  it('keeps unavailable configuration, anonymous requests and failed bot checks closed', async () => {
    expect(
      (await post('request', { phone: PHONE, consent: true, turnstileToken: '' })).status,
    ).toBe(403);
    expect(
      (await post('request', { phone: PHONE, consent: true, turnstileToken: 'token' }, '')).status,
    ).toBe(401);
    expect(
      (
        await platform.send(
          apiRequest('POST', '/api/sms/request', { body: { phone: PHONE, consent: true }, cookie }),
        )
      ).status,
    ).toBe(503);
    expect(calls).toHaveLength(0);
  });

  it('expires confirmation and limits repeated code requests', async () => {
    for (let n = 0; n < 3; n += 1)
      expect(
        (await post('request', { phone: PHONE, consent: true, turnstileToken: 'token' })).status,
      ).toBe(200);
    expect(
      (await post('request', { phone: PHONE, consent: true, turnstileToken: 'token' })).status,
    ).toBe(429);
    vi.setSystemTime(new Date('2026-10-04T19:31:00Z'));
    expect((await post('confirm', { code: '123456' })).status).toBe(400);
  });

  it('does not re-enable texts when confirmation finishes after cancellation', async () => {
    await post('request', { phone: PHONE, consent: true, turnstileToken: 'token' });
    onCheck = async () => {
      await post('unsubscribe');
    };
    expect((await post('confirm', { code: '123456' })).status).toBe(409);
    expect((await subscriptions()).results).toHaveLength(0);
  });

  it('honors signed STOP replies and rejects forged webhooks', async () => {
    await enroll();
    expect((await webhook({ Body: 'STOP', OptOutType: 'STOP' }, false)).status).toBe(403);
    expect((await subscriptions()).results).toHaveLength(1);
    expect((await webhook({ Body: 'STOP', OptOutType: 'STOP' })).status).toBe(200);
    expect((await subscriptions()).results).toHaveLength(0);
    expect((await webhook({ Body: 'START', OptOutType: 'START' })).status).toBe(200);
    expect((await subscriptions()).results).toHaveLength(0);
  });

  it('claims batches across concurrent runs without sending the same number twice', async () => {
    const db = platform.env.DB;
    await db.batch(
      Array.from({ length: 25 }, (_, n) =>
        db
          .prepare(
            `INSERT INTO participants (id, first_name, contact, contact_type, zip, age, created_at, updated_at)
       VALUES (?1, 'Ana', ?2, 'email', '89101', 'adult', ?3, ?3)`,
          )
          .bind(`sms-${n}`, `ana${n}@example.com`, '2026-10-04T12:00:00Z'),
      ),
    );
    await db.batch(
      Array.from({ length: 25 }, (_, n) =>
        db
          .prepare(
            `INSERT INTO sms_subscriptions (participant_id, phone, consented_at, confirmed_at) VALUES (?1, ?2, ?3, ?3)`,
          )
          .bind(`sms-${n}`, `+1702555${String(n).padStart(4, '0')}`, '2026-10-04T12:00:00Z'),
      ),
    );
    await Promise.all([
      platform.cron(PLAN_PUSH_CRONS[0], '2026-10-05T15:02:00Z', CONFIG),
      platform.cron(PLAN_PUSH_CRONS[0], '2026-10-05T15:02:00Z', CONFIG),
    ]);
    await platform.cron(PLAN_PUSH_CRONS[0], '2026-10-05T15:07:00Z', CONFIG);
    const messages = calls.filter((call) => call.url.endsWith('/Messages.json'));
    expect(messages).toHaveLength(25);
    expect(new Set(messages.map((call) => call.body.get('To'))).size).toBe(25);
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) AS total FROM sms_subscriptions WHERE last_sent_on = '2026-10-05' AND claim IS NULL",
        )
        .first('total'),
    ).toBe(25);
  });

  it('deletes phone enrollment, pending confirmation and private links with campaign data', async () => {
    await enroll();
    await post('request', { phone: PHONE, consent: true, turnstileToken: 'token' });
    await platform.cron(PLAN_PUSH_CRONS[0], '2026-10-05T15:02:00Z', CONFIG);
    await platform.cron(CLEANUP_CRON, '2026-11-30T13:00:00Z', CONFIG);
    for (const table of ['sms_subscriptions', 'sms_verifications', 'link_tokens'])
      expect(
        await platform.env.DB.prepare(`SELECT COUNT(*) AS total FROM ${table}`).first('total'),
      ).toBe(0);
  });

  it('sends each confirmed number one morning text with a working private link and stops after cancellation', async () => {
    await enroll();
    await platform.cron(PLAN_PUSH_CRONS[0], '2026-10-05T15:02:00Z', CONFIG);
    const messages = calls.filter((call) => call.url.endsWith('/Messages.json'));
    expect(messages).toHaveLength(1);
    const text = messages[0]?.body.get('Body') ?? '';
    expect(text.length).toBeLessThanOrEqual(160);
    expect(text).toContain('Reply STOP to end.');
    const link = new URL(
      text.split(' ').find((word) => word.startsWith(`${ORIGIN}/open#`)) ?? ORIGIN,
    );
    const token = link.hash.slice(1);
    expect(token).toMatch(/^[\w-]{22}$/);
    const open = await platform.send(new Request(`${ORIGIN}/my-week?t=${token}`), CONFIG);
    expect(open.status).toBe(302);
    expect(open.headers.get('Set-Cookie')).toContain('__Host-lvwwd_session=');
    await platform.cron(PLAN_PUSH_CRONS[0], '2026-10-05T15:07:00Z', CONFIG);
    expect(calls.filter((call) => call.url.endsWith('/Messages.json'))).toHaveLength(1);
    await post('unsubscribe');
    await platform.cron(PLAN_PUSH_CRONS[0], '2026-10-06T15:02:00Z', CONFIG);
    expect(calls.filter((call) => call.url.endsWith('/Messages.json'))).toHaveLength(1);
  });

  it('removes a number rejected by the sender as opted out and sends nothing outside the morning window', async () => {
    await enroll();
    await platform.cron(PLAN_PUSH_CRONS[0], '2026-10-05T14:57:00Z', CONFIG);
    expect(calls.filter((call) => call.url.endsWith('/Messages.json'))).toHaveLength(0);
    messageStatus = 400;
    await platform.cron(PLAN_PUSH_CRONS[0], '2026-10-05T15:02:00Z', CONFIG);
    expect((await subscriptions()).results).toHaveLength(0);
  });
});
