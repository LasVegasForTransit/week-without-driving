import type { Env, Participant } from './env';

/**
 * The one place that sends an "Open my week" link.
 *
 * Email goes through Resend when RESEND_API_KEY is set. Earlier phone
 * accounts have no delivery channel and cannot be created by web signup.
 */
export type Delivery = 'sent' | 'pending' | 'failed' | 'unconfigured';

const RESEND = 'https://api.resend.com/emails';
const FROM = 'Week Without Driving Las Vegas <hello@lvwwd.org>';
const REPLY_TO = 'wwd@lasvegasfortransit.org';
const SUBJECT = 'Your Week Without Driving link';
const LVBT_JOIN = 'https://lasvegasfortransit.org/join/member/?from=wwd';

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
    'Open your week:',
    link,
    '',
    'October 1–8: add a trip without driving each day for a chance to win a 30-day RTC bus pass. Posting is optional.',
    '',
    'Your private link works through November 30. Anyone with it can open your week.',
    '',
    'Help improve transit year-round with Las Vegans for Better Transit. Joining is a separate signup:',
    LVBT_JOIN,
    '',
    'Week Without Driving Las Vegas',
    'Las Vegans for Better Transit',
  ].join('\n');
}

function html(to: Recipient, link: string): string {
  const href = escapeHtml(link);
  const name = escapeHtml(to.firstName);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>Your Week Without Driving link</title><style type="text/css">@font-face{font-family:'Atkinson Hyperlegible Next';src:url('https://lvwwd.org/fonts/atkinson-next-400-core.woff2') format('woff2');font-weight:400;mso-font-alt:Arial}@font-face{font-family:'Fraunces';src:url('https://lvwwd.org/fonts/fraunces-600-core.woff2') format('woff2');font-weight:600;mso-font-alt:Georgia}@media only screen and (max-width:640px){.outer{padding:0!important}.email{width:100%!important}.main{padding:30px 24px 38px!important}.footer{padding:24px!important}.headline{font-size:31px!important;line-height:115%!important}}</style><!--[if mso]><style type="text/css">body,table,td,h1,p,a{font-family:Arial,Helvetica,sans-serif!important}</style><![endif]--></head><body style="margin:0;padding:0;background-color:#f4ece7;color:#4b2130;font-family:'Atkinson Hyperlegible Next',Arial,Helvetica,sans-serif"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#f4ece7" style="border-collapse:collapse;background-color:#f4ece7;mso-table-lspace:0pt;mso-table-rspace:0pt"><tr><td class="outer" align="center" style="padding:44px 18px 64px"><!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="620" align="center"><tr><td><![endif]--><table role="presentation" cellpadding="0" cellspacing="0" border="0" class="email" width="100%" bgcolor="#ffffff" style="width:100%;max-width:620px;border-collapse:collapse;background-color:#ffffff;mso-table-lspace:0pt;mso-table-rspace:0pt;font-family:'Atkinson Hyperlegible Next',Arial,Helvetica,sans-serif"><tr><td height="8" bgcolor="#f2532d" style="height:8px;background-color:#f2532d;font-size:0;line-height:0">&nbsp;</td></tr><tr><td class="main" style="padding:38px 48px 44px"><p style="margin:0 0 31px;color:#4b2130;font-size:15px;line-height:135%;font-weight:700;letter-spacing:0.03em">WEEK WITHOUT DRIVING <span style="color:#765360">· LAS VEGAS</span></p><h1 class="headline" style="margin:0 0 20px;color:#3d1925;font-family:Fraunces,Georgia,serif;font-size:37px;line-height:115%;font-weight:600">Your week is ready, ${name}!</h1><p style="margin:0 0 24px;color:#4b2130;font-size:17px;line-height:155%">October 1–8: add a trip without driving each day for a chance to win a 30-day RTC bus pass. Posting is optional.</p><table role="presentation" cellpadding="0" cellspacing="0" border="0" bgcolor="#542432" style="border-collapse:collapse;background-color:#542432"><tr><td bgcolor="#542432" style="padding:15px 22px;background-color:#542432"><a href="${href}" style="color:#ffffff;font-size:16px;line-height:125%;font-weight:700;text-decoration:none">Open my week</a></td></tr></table><p style="margin:26px 0 12px;color:#765360;font-size:14px;line-height:155%">Your private link works through November 30. Anyone with it can open your week.</p><p style="margin:0;color:#765360;font-size:13px;line-height:155%;overflow-wrap:anywhere">Button not working? Use this link:<br><a href="${href}" style="color:#3d1925;text-decoration:underline;word-break:break-all">${href}</a></p><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#f1d8ca" style="margin-top:31px;border-collapse:collapse;background-color:#f1d8ca;mso-table-lspace:0pt;mso-table-rspace:0pt"><tr><td style="padding:23px 24px"><p style="margin:0 0 8px;color:#3d1925;font-size:18px;line-height:135%;font-weight:700">Help improve transit year-round</p><p style="margin:0 0 12px;color:#4b2130;font-size:14px;line-height:155%">LVBT works for better buses and safer streets. Joining is a separate signup.</p><p style="margin:0;font-size:14px;line-height:145%;font-weight:700"><a href="${LVBT_JOIN}" style="color:#3d1925;text-decoration:underline">Join LVBT</a></p></td></tr></table></td></tr><tr><td class="footer" bgcolor="#431a28" style="padding:27px 48px 32px;background-color:#431a28;color:#f4ece7"><p style="margin:0 0 8px;color:#f4ece7;font-size:15px;line-height:140%;font-weight:700"><a href="https://lvwwd.org/" style="color:#f4ece7;text-decoration:none">Week Without Driving Las Vegas</a></p><p style="margin:0;color:#f0d7ca;font-size:13px;line-height:155%">By Las Vegans for Better Transit. Questions? Reply to this email.</p></td></tr></table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>`;
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
