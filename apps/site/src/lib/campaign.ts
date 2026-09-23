import { photos, type Photo } from './photos';
import { wwd } from './wwd';

// Campaign content that LVBT fills in as it is confirmed: the daily
// Instagram hosts, the proclamations, and the prizes. Each entry starts
// empty (null) and the page shows a clearly marked "to come" slot for it,
// so the page has a place for every piece before the piece exists. Fill
// these in as each one is confirmed; never guess a name.

const dayFormat = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'America/Los_Angeles',
});

/** Who hosts the LVBT Instagram on each day of the week, in day order. */
const dayHosts: Array<string | null> = [null, null, null, null, null, null, null, null];

export const days = dayHosts.map((host, i) => {
  const date = new Date(wwd.start.getTime() + i * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000);
  const [weekday = '', monthDay = ''] = dayFormat.format(date).split(', ');
  return { number: i + 1, weekday, monthDay, host };
});

/** The local governments asked to proclaim the week, and the proclamation once issued. */
export const proclamations: Array<{ government: string; url: string | null }> = [
  { government: 'City of Las Vegas', url: null },
  { government: 'Clark County', url: null },
  { government: 'City of Henderson', url: null },
  { government: 'City of North Las Vegas', url: null },
];

/** The giveaway prizes, as the Giveaway page describes them. */
export const prizes: Array<{ name: string; body: string; photo: string; image?: Photo }> = [
  {
    name: 'A one-month RTC bus pass',
    body: 'Ride any RTC bus as much as you want for a month.',
    photo: 'An RTC 30-day pass in someone’s hand at a bus stop',
    image: photos.rtcBusMlk,
  },
  {
    name: 'An LVBT sticker pack',
    body: 'Stickers for your water bottle, laptop or bike.',
    photo: 'LVBT stickers spread out on a table',
  },
];

/** The three steps to win, shown the same way on How it works and Win prizes. */
export const winSteps = [
  {
    icon: 'mdi:account-plus-outline',
    title: 'Sign up',
    body: 'It takes a minute: your first name, a phone number or email, and your ZIP code.',
    cta: 'Sign up to win',
    href: '/sign-up',
  },
  {
    icon: 'mdi:calendar-check-outline',
    title: 'Check in each day',
    body: 'From October 1 to 8, tap Check in for today on My week. Each day is one entry, up to 8.',
  },
  {
    icon: 'mdi:gift-outline',
    title: 'Win',
    body: 'We draw a winner by October 15, 2026, and contact them the way they signed up.',
  },
] as const;
