import { photos, type Photo } from './photos';
import { wwd } from './wwd';

// Campaign content that LVBT fills in as it is confirmed: the daily
// Instagram hosts and proclamations are shown when confirmed. Prize
// information describes only the committed RTC bus pass.

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
export const prizes: Array<{
  name: string;
  body: string;
  photo: string;
  image?: Photo;
  icon: string;
}> = [
  {
    name: 'A 30-day RTC bus pass',
    body: 'One 30-day pass for RTC buses.',
    photo: 'An RTC bus traveling through Las Vegas',
    image: photos.rtcBusMlk,
    icon: 'mdi:card-account-details-outline',
  },
];

/** The three steps to win, shown on How it works and the giveaway page. */
export const winSteps = [
  {
    icon: 'mdi:account-plus-outline',
    title: 'Sign up',
    body: 'Use your first name, email address, ZIP code and county.',
    cta: 'Sign up to win',
    href: '/sign-up',
  },
  {
    icon: 'mdi:bus',
    title: 'Leave the car at home',
    body: 'Take the bus, walk, roll, bike or get a ride. One trip is enough.',
    cta: 'Find a bus near you',
    href: '/go',
  },
  {
    icon: 'mdi:note-text-outline',
    title: 'Tell us about your trip',
    body: 'Describe it on My week. A post or photo is optional. One entry per day, up to 8.',
  },
] as const;
