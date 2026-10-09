// The site's navigation. Wide screens show mainNav in the header; phones
// and tablets show the same list, with a line of help under each link, in
// the menu that the ☰ button opens. Labels say what a visitor will do
// there, in plain words, rather than naming the page.
export const mainNav = [
  {
    href: '/how-it-works',
    label: 'How it works',
    help: 'What the week is, and how to win.',
    icon: 'mdi:hand-heart-outline',
  },
  {
    href: '/go',
    label: 'Plan a trip',
    help: 'Compare ways to go, find a bus, or pick a place.',
    icon: 'mdi:routes',
  },
  {
    href: '/guides',
    label: 'Rider guides',
    help: 'Your first ride, how to pay and staying cool.',
    icon: 'mdi:book-open-variant-outline',
  },
  {
    href: '/bingo',
    label: 'Bingo',
    help: 'Play transit bingo all week.',
    icon: 'mdi:grid',
  },
  {
    href: '/giveaway',
    label: 'Win a bus pass',
    help: 'Share a trip without the car to win a bus pass.',
    icon: 'mdi:gift-outline',
  },
  {
    href: '/partners',
    label: 'Partners',
    help: 'Bring your group, school or workplace.',
    icon: 'mdi:account-group-outline',
  },
] as const;

// The tab bar along the bottom of phones and tablets: the five things a
// rider does during the week, one tap from any page. The last tab is
// "Sign up" until this phone signs up, then "My week" (site-nav.js swaps
// it, as it does every sign-up button).
export const tabNav = [
  { href: '/', label: 'Home', icon: 'mdi:home-outline', match: ['/'] },
  { href: '/go', label: 'Plan', icon: 'mdi:map-marker-path', match: ['/go'] },
  { href: '/guides', label: 'Guides', icon: 'mdi:book-open-variant-outline', match: ['/guides'] },
  { href: '/bingo', label: 'Bingo', icon: 'mdi:grid', match: ['/bingo'] },
  {
    href: '/sign-up',
    label: 'Sign up',
    icon: 'mdi:calendar-check-outline',
    match: ['/sign-up', '/my-week'],
    signup: true,
  },
] as const;

export const footerExploreLinks = [
  { href: '/press', label: 'Press' },
  { href: '/resources', label: 'Resources' },
] as const;

export const footerDetailLinks = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms of Use' },
  { href: '/giveaway/rules', label: 'Official Rules' },
] as const;

// True when `path` is the nav item's page or one of its subpages, so
// /guides/heat marks Rider guides as current.
export function isCurrent(href: string, path: string): boolean {
  const clean = path.replace(/\/$/, '') || '/';
  const [beforeHash = ''] = href.split('#');
  const target = beforeHash === '' ? '/' : beforeHash;
  if (target === '/') return clean === '/';
  return clean === target || clean.startsWith(`${target}/`);
}
