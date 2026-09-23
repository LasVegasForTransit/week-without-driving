import type { Env, Participant } from './env';

/**
 * The one place that sends an "Open my week" link.
 *
 * Email goes through Resend when RESEND_API_KEY is set. Texts have no
 * provider yet, so a phone's link is recorded as "pending": we keep only
 * the token's hash, so whatever sends texts later issues a fresh link to
 * each participant with a pending one.
 */
export type Delivery = 'sent' | 'pending' | 'failed' | 'unconfigured';

const RESEND = 'https://api.resend.com/emails';
const FROM = 'Week Without Driving Las Vegas <hello@lvwwd.org>';
const REPLY_TO = 'wwd@lasvegasfortransit.org';
const SUBJECT = 'Your Week Without Driving link';

type Recipient = Pick<Participant, 'firstName' | 'contact' | 'contactType'>;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function plainText(to: Recipient, link: string): string {
  return [
    `Hi ${to.firstName},`,
    '',
    'Open My week with this link:',
    link,
    '',
    'Check in there each day, October 1 to 8. Each day you check in is one entry to win a one-month RTC bus pass.',
    '',
    'The link works on any phone until November 30, 2026. Don’t share it: anyone who has it can open your week.',
    '',
    'Week Without Driving Las Vegas',
    'Las Vegans for Better Transit',
  ].join('\n');
}

function html(to: Recipient, link: string): string {
  const href = escapeHtml(link);
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;font-size:17px;line-height:1.5;color:#111">
<p>Hi ${escapeHtml(to.firstName)},</p>
<p><a href="${href}" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;border-radius:999px;font-weight:bold;text-decoration:none">Open my week</a></p>
<p>Check in there each day, October 1 to 8. Each day you check in is one entry to win a one-month RTC bus pass.</p>
<p>The link works on any phone until November 30, 2026. Don’t share it: anyone who has it can open your week.</p>
<p>If the button doesn’t work, copy this address into your browser:<br>${href}</p>
<p>Week Without Driving Las Vegas<br>Las Vegans for Better Transit</p>
</body></html>`;
}

export async function sendLink(env: Env, to: Recipient, link: string): Promise<Delivery> {
  if (to.contactType === 'phone') return 'pending';
  if (!env.RESEND_API_KEY) return 'unconfigured';
  try {
    const response = await fetch(RESEND, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: [to.contact],
        reply_to: REPLY_TO,
        subject: SUBJECT,
        text: plainText(to, link),
        html: html(to, link),
      }),
    });
    if (response.ok) return 'sent';
    console.error('Resend refused the email', response.status, await response.text());
    return 'failed';
  } catch (error) {
    console.error('Resend could not be reached', error);
    return 'failed';
  }
}
