import { wwd } from './wwd';

// The partner roster, for the Partners page and for crediting sign-ups.
// It is driven by `wwd.partners` (apps/site/src/lib/wwd.ts), which stays
// an empty array until LVBT confirms its first partner by email. That
// array's declared shape only carries `name` and an optional `url`; a real
// roster entry also needs a slug (the short name in its `?ref=<slug>`
// link), a type and a one-sentence blurb. Rather than widen the shared
// `wwd.ts` type for a shape nothing uses yet, this file casts the (always
// empty, for now) array to the fuller shape a populated roster needs. When
// the roster gets its first real entry, `wwd.ts` should grow those fields
// directly and this cast can be dropped.
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

/**
 * The partner a `?ref=<slug>` link names, or null when it names none on the
 * roster (a typo, or a link to a group that has left). Capital letters and
 * spaces around the slug are ignored. The Worker uses this to credit a
 * sign-up, so the roster above is the only list of partners.
 */
export function partnerForRef(ref: unknown): Partner | null {
  if (typeof ref !== 'string') return null;
  const slug = ref.trim().toLowerCase();
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) return null;
  return partners.find((partner) => partner.slug === slug) ?? null;
}

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
