// The site's own navigation, in display order. The header and the footer
// both render from this list, so adding a page is a one-line change here.
export const nav = [
  { href: '/', label: 'Home' },
  { href: '/take-part', label: 'Take Part' },
  { href: '/guides', label: 'Guides' },
  { href: '/go', label: 'Go' },
  { href: '/bingo', label: 'Bingo' },
  { href: '/giveaway', label: 'Giveaway' },
  { href: '/resources', label: 'Resources' },
  { href: '/partners', label: 'Partners' },
] as const;

export const footerLinks = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms of Use' },
  { href: '/giveaway/rules', label: 'Official Rules' },
] as const;

// True when `path` is the nav item's page or one of its subpages, so
// /guides/heat marks Guides as current.
export function isCurrent(href: string, path: string): boolean {
  const clean = path.replace(/\/$/, '') || '/';
  if (href === '/') return clean === '/';
  return clean === href || clean.startsWith(`${href}/`);
}
