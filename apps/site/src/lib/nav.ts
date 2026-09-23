// The site's navigation. Phones get a bottom tab bar (tabNav) plus a More
// sheet (moreNav); wide screens get one top row (topNav). The logo is the
// way home on wide screens, so Home is not repeated there.
export const topNav = [
  { href: '/take-part', label: 'Take Part' },
  { href: '/guides', label: 'Guides' },
  { href: '/go', label: 'Go' },
  { href: '/bingo', label: 'Bingo' },
  { href: '/giveaway', label: 'Giveaway' },
  { href: '/partners', label: 'Partners' },
] as const;

export const tabNav = [
  { href: '/', match: '/', label: 'Home', icon: 'mdi:home-variant-outline', pledge: false },
  {
    href: '/take-part#pledge',
    match: '/take-part',
    label: 'Pledge',
    icon: 'mdi:hand-heart-outline',
    pledge: true,
  },
  { href: '/go', match: '/go', label: 'Go', icon: 'mdi:bus', pledge: false },
  { href: '/bingo', match: '/bingo', label: 'Bingo', icon: 'mdi:grid', pledge: false },
] as const;

export const moreNav = [
  { href: '/guides', label: 'Guides', icon: 'mdi:book-open-variant-outline' },
  { href: '/giveaway', label: 'Giveaway', icon: 'mdi:gift-outline' },
  { href: '/partners', label: 'Partners', icon: 'mdi:account-group-outline' },
  { href: '/resources', label: 'Resources', icon: 'mdi:link-variant' },
  { href: '/privacy', label: 'Privacy', icon: 'mdi:shield-lock-outline' },
  { href: '/terms', label: 'Terms of Use', icon: 'mdi:file-document-outline' },
] as const;

export const footerLinks = [
  { href: '/resources', label: 'Resources' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms of Use' },
  { href: '/giveaway/rules', label: 'Official Rules' },
] as const;

// True when `path` is the nav item's page or one of its subpages, so
// /guides/heat marks Guides as current.
export function isCurrent(href: string, path: string): boolean {
  const clean = path.replace(/\/$/, '') || '/';
  const [beforeHash = ''] = href.split('#');
  const target = beforeHash === '' ? '/' : beforeHash;
  if (target === '/') return clean === '/';
  return clean === target || clean.startsWith(`${target}/`);
}
