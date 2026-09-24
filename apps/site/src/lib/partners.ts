import { roster } from '../data/partners';

// Partners: the organizations bringing Week Without Driving to their
// members, and what the site makes for each of them. The roster itself is
// src/data/partners.ts; this file checks it, sorts it, and builds each
// partner's link and QR code addresses.

export const PARTNER_TYPES = [
  'Community and neighborhood groups',
  'Student groups',
  'Environmental and justice groups',
  'Disability and senior advocates',
  'Employers and businesses',
  'Public agencies',
] as const;

export type PartnerType = (typeof PARTNER_TYPES)[number];

/** One organization, as a volunteer writes it in the roster. */
export interface RosterItem {
  /** Short, permanent name: lowercase letters, digits and single hyphens. */
  slug: string;
  /** The organization's name as it wants it shown. */
  name: string;
  /** Its website or social media page, starting with https://. */
  url?: string;
  type: PartnerType;
  /** One sentence on how it is taking part, at most 200 characters. */
  sentence: string;
}

export type Partner = RosterItem;

/** The slug kept for LVBT's own materials, which no partner may use. */
export const GENERAL = 'general';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG = 40;
const MAX_SENTENCE = 200;

/** A roster item as written, before it is checked: any field may be missing or wrong. */
export type UncheckedItem = { [Field in keyof RosterItem]?: unknown };

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function slugProblems(slug: string): string[] {
  const problems: string[] = [];
  if (!SLUG.test(slug)) {
    problems.push(
      `its slug "${slug}" must be lowercase letters and digits, with single hyphens between them`,
    );
  }
  if (slug.length > MAX_SLUG) problems.push(`its slug is longer than ${MAX_SLUG} characters`);
  if (slug === GENERAL) problems.push(`the slug "${GENERAL}" is kept for LVBT's own materials`);
  return problems;
}

function problemsWith(item: UncheckedItem): string[] {
  const missing = (['slug', 'name', 'type', 'sentence'] as const)
    .filter((field) => text(item[field]).trim() === '')
    .map((field) => `it has no ${field}`);
  const problems = [...missing];
  const slug = text(item.slug);
  if (slug) problems.push(...slugProblems(slug));
  if (item.url !== undefined && !text(item.url).startsWith('https://')) {
    problems.push(`its url "${text(item.url)}" must start with https://`);
  }
  const type = text(item.type);
  if (type && !(PARTNER_TYPES as readonly string[]).includes(type)) {
    problems.push(`its type "${type}" must be one of: ${PARTNER_TYPES.join('; ')}`);
  }
  const sentence = text(item.sentence);
  if (sentence.length > MAX_SENTENCE) {
    problems.push(`its sentence is ${sentence.length} characters, more than ${MAX_SENTENCE}`);
  }
  return problems;
}

/**
 * Checks every roster item and throws one error listing each problem with
 * the partner's name, so the build stops before a broken link or QR code
 * is published.
 */
export function checkRoster(items: readonly UncheckedItem[]): Partner[] {
  const problems: string[] = [];
  const seen = new Map<string, string>();
  items.forEach((item, index) => {
    const name = text(item.name);
    const who = name ? `"${name}"` : `item ${index + 1}`;
    for (const problem of problemsWith(item)) problems.push(`${who}: ${problem}`);
    const slug = text(item.slug);
    if (!slug) return;
    const other = seen.get(slug);
    if (other) problems.push(`${who}: its slug "${slug}" is already used by ${other}`);
    seen.set(slug, who);
  });
  if (problems.length > 0) {
    throw new Error(
      `The partner roster (src/data/partners.ts) has problems:\n- ${problems.join('\n- ')}`,
    );
  }
  return items as Partner[];
}

/** The name a partner is sorted by: no capitals, and no leading "The ". */
function sortName(name: string): string {
  return name.replace(/^the\s+/i, '').toLocaleLowerCase('en-US');
}

/** Partners in alphabetical order of name, ignoring capitals and a leading "The ". */
export function sortPartners(items: readonly Partner[]): Partner[] {
  return [...items].sort((a, b) => sortName(a.name).localeCompare(sortName(b.name), 'en-US'));
}

/** The giveaway link that credits sign-ups to a partner, or LVBT's general one. */
export function partnerLink(slug: string): string {
  return slug === GENERAL ? 'https://lvwwd.org/giveaway' : `https://lvwwd.org/giveaway?ref=${slug}`;
}

/** Where a partner's (or the general) QR code files are published. */
export function qrFiles(slug: string): { png: string; svg: string } {
  return { png: `/partners/qr/${slug}.png`, svg: `/partners/qr/${slug}.svg` };
}

/** Every partner, checked and sorted. Empty until the first partner confirms. */
export const partners: Partner[] = sortPartners(checkRoster(roster));

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
