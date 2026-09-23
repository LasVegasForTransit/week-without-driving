// Shared data for the pledge picker (Take Part) and the participant kit
// pages. Exact tier names and card copy come from the pledge Epic's
// Feature draft "Let visitors pledge at the level they choose in two taps"
// (section 5.1 of the shared decisions file). Kept here, rather than
// duplicated on each page, so the picker and the three kit pages can never
// drift out of sync on a tier's name or description.
export type PledgeTierId = 'trip' | 'day' | 'week';

export interface PledgeTier {
  id: PledgeTierId;
  /** Exactly as shown on its card and used as "<Tier>" elsewhere. */
  name: string;
  /** The card's one line describing what the tier asks. */
  description: string;
}

export const pledgeTiers: readonly PledgeTier[] = [
  {
    id: 'trip',
    name: 'One Trip',
    description:
      'Take one trip without driving: by bus, walking or rolling, biking, or getting a ride.',
  },
  {
    id: 'day',
    name: 'One Day',
    description: 'Go one full day without driving.',
  },
  {
    id: 'week',
    name: 'One Week',
    description: 'Go all eight days, October 1 to 8, without driving.',
  },
] as const;

export function pledgeTierById(id: string): PledgeTier | undefined {
  return pledgeTiers.find((tier) => tier.id === id);
}

// The only browser key a pledge uses: a one-year cookie holding the tier,
// nothing personal. Documented in the build brief's "Browser keys" list.
export const PLEDGE_COOKIE = 'lvwwd_tier';

// "Your next steps" on the participant kit, in the fixed order from the
// shared decisions file (6.5, 6.9): "Plan a trip" (not "Plan your first
// trip"), "Get your bingo card", "Enter the giveaway".
export const kitNextSteps: ReadonlyArray<{ label: string; href: string }> = [
  { label: 'Plan a trip', href: '/guides' },
  { label: 'Get your bingo card', href: '/bingo' },
  { label: 'Enter the giveaway', href: '/giveaway' },
] as const;

// The paragraph every kit page carries under its phase line, exactly as
// written in "Give each pledger a participant kit with next steps".
export const kitFramingParagraph =
  "However you get around, by bus, walking or rolling, biking, or getting a ride, it counts. If you have to drive, you haven't failed. Notice what made driving necessary: that's what this week is about.";
