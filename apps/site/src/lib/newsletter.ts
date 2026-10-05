// LVBT's separate membership invitation, shown after campaign sign-up and
// in the "Keep going after the week" cards.

import { lvbt } from './site';

// The Worker enables direct newsletter signup only when Beehiiv and the
// bot check are configured. Otherwise this external link remains usable.

/** LVBT's membership page, carrying the campaign referral for onboarding. */
export const NEWSLETTER_PAGE = lvbt.joinUrl;

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
