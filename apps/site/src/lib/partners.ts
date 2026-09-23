import { wwd } from './wwd';

// The Partners page roster. It is driven by `wwd.partners`
// (apps/site/src/lib/wwd.ts), which is an empty array until LVBT confirms
// its first partner by email — see "Show the organizations taking part on
// the Partners page". That array's declared shape only carries `name` and
// an optional `url`; a real roster entry also needs a slug (for its
// `?ref=<slug>` link), a type and a one-sentence blurb. Rather than widen
// the shared `wwd.ts` type for a shape nothing currently uses, this file
// casts the (always empty, for now) array to the fuller shape a populated
// roster will need. When the roster gets its first real entry, `wwd.ts`
// should grow those fields directly and this cast can be dropped.
export type PartnerType =
  | 'Community and neighborhood groups'
  | 'Student groups'
  | 'Environmental and justice groups'
  | 'Disability and senior advocates'
  | 'Employers and businesses'
  | 'Public agencies';

export interface Partner {
  name: string;
  slug: string;
  url?: string;
  /** Logo image path or URL, once the partner has sent one in. */
  logoUrl?: string;
  type: PartnerType;
  sentence: string;
}

export const partners: Partner[] = wwd.partners as Partner[];

export const contactEmail = 'wwd@lasvegasfortransit.org';

export const joinMailto = `mailto:${contactEmail}?subject=${encodeURIComponent(
  'Week Without Driving partnership',
)}&body=${encodeURIComponent(
  [
    'Group name:',
    'Website or social media page (if you have one):',
    'Kind of group:',
    "How we'll take part:",
    'Contact name:',
  ].join('\n'),
)}`;
