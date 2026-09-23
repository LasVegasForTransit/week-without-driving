// The site's navigation. Wide screens show mainNav in the header; phones
// and tablets show the same list, with a line of help under each link, in
// the menu that the ☰ button opens. Labels say what a visitor will do
// there, in plain words, rather than naming the page.
export const mainNav = [
  {
    href: '/take-part',
    label: 'How it works',
    help: 'What the week is, and how to win.',
    icon: 'mdi:hand-heart-outline',
  },
  {
    href: '/go',
    label: 'Find a bus',
    help: 'See the bus stops closest to you.',
    icon: 'mdi:bus',
  },
  {
    href: '/guides',
    label: 'Rider guides',
    help: 'How to pay, bring a bike and stay cool.',
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
    label: 'Win prizes',
    help: 'Check in each day to win a bus pass.',
    icon: 'mdi:gift-outline',
  },
  {
    href: '/partners',
    label: 'Partners',
    help: 'Bring your group, school or workplace.',
    icon: 'mdi:account-group-outline',
  },
] as const;

export const footerLinks = [
  { href: '/press', label: 'Press' },
  { href: '/resources', label: 'Resources' },
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
