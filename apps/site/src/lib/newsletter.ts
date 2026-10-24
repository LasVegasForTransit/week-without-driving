// LVBT's separate membership invitation, shown after campaign sign-up and
// in the "Keep going after the week" cards.

import { lvbt } from './site';

// The Worker enables direct newsletter signup only when Beehiiv and the
// bot check are configured. Otherwise this external link remains usable.

/** LVBT's membership page, carrying the campaign referral for onboarding. */
export const NEWSLETTER_PAGE = lvbt.joinUrl;

/** 12:00 am October 9, 2026, Las Vegas time: the 2026 giveaway closes. */
export const GIVEAWAY_CLOSES = '2026-10-09T07:00:00Z';

export const KEEP_GOING = {
  heading: 'Keep going after the week',
  text: 'Turn what you noticed on your trips into support for better buses and safer streets. Join Las Vegans for Better Transit’s year-round work across the valley.',
} as const;

export const STAY_INVOLVED = {
  heading: 'Stay involved with LVBT',
  text: 'Help Las Vegans for Better Transit advocate for better buses and safer streets across the valley, all year long.',
} as const;
