// LVBT's newsletter, as the "Keep going after the week" card on My week and
// Home's "Stay involved with LVBT" section offer it.

/**
 * Whether the card can add someone to LVBT's newsletter in one tap, through
 * the Worker's POST /api/newsletter. That route, and the Beehiiv key it
 * needs in production, are not built yet, so the card links to LVBT's own
 * newsletter page instead; the one-tap sign-up is built and tested, and
 * turning this on is the only change the card needs once the route works.
 */
export const ONE_TAP_NEWSLETTER = false;

/** LVBT's newsletter sign-up page, for anyone the one-tap sign-up can't serve. */
export const NEWSLETTER_PAGE = 'https://mail.lasvegasfortransit.org/';

/** 12:00 am October 9, 2026, Las Vegas time: the giveaway closes and Home changes. */
export const GIVEAWAY_CLOSES = '2026-10-09T07:00:00Z';

export const KEEP_GOING = {
  heading: 'Keep going after the week',
  text: 'Week Without Driving lasts eight days, but Las Vegans for Better Transit works all year for better buses and safer streets across the valley. Keep going with us.',
} as const;

export const STAY_INVOLVED = {
  heading: 'Stay involved with LVBT',
  text: 'Week Without Driving 2026 is over. Thank you for taking part. Keep going after the week with Las Vegans for Better Transit: we work all year for better buses and safer streets across the valley.',
} as const;
