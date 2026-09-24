// The partner banners: their sizes, colors and words. The Partners page's
// kit offers them, and scripts/build-banners.mjs draws the PNG files in
// public/partners/banners from this list.

/** The site's own palette (src/styles/global.css). */
export const BANNER_COLORS = {
  background: '#0e5f66', // --teal-deep, the slab
  text: '#fbf4e6', // --sand
  quiet: '#cfe7e4', // --slab-mist
  button: '#ff6b4a', // --coral-bright
  onButton: '#1a1210', // --on-coral
} as const;

/** Every text on a banner and the color behind it; each must reach 4.5 to 1. */
export const BANNER_TEXT_PAIRS: ReadonlyArray<readonly [string, string, string]> = [
  ['headline', BANNER_COLORS.text, BANNER_COLORS.background],
  ['dates', BANNER_COLORS.quiet, BANNER_COLORS.background],
  ['sign-up line', BANNER_COLORS.onButton, BANNER_COLORS.button],
];

/** The three lines every banner shows. */
export const BANNER_LINES = {
  name: 'Week Without Driving Las Vegas',
  dates: 'October 1 to 8, 2026',
  signUp: 'Sign up to win at lvwwd.org',
} as const;

/** The image description of every banner, and the alt text in the embed snippet. */
export const BANNER_DESCRIPTION =
  'Week Without Driving Las Vegas, October 1 to 8, 2026. Sign up to win at lvwwd.org.';

export interface Banner {
  file: string;
  width: number;
  height: number;
  /** The most the file may weigh, so it loads quickly on partners' pages. */
  maxBytes: number;
  name: string;
  purpose: string;
  layout: 'stack' | 'strip';
}

export const BANNERS: readonly Banner[] = [
  {
    file: '1080x1080.png',
    width: 1080,
    height: 1080,
    maxBytes: 1_000_000,
    name: 'Square post',
    purpose: 'For Instagram and Facebook posts.',
    layout: 'stack',
  },
  {
    file: '1080x1920.png',
    width: 1080,
    height: 1920,
    maxBytes: 1_500_000,
    name: 'Story',
    purpose: 'For Instagram and Facebook stories and WhatsApp status.',
    layout: 'stack',
  },
  {
    file: '300x250.png',
    width: 300,
    height: 250,
    maxBytes: 150_000,
    name: 'Website box',
    purpose: 'For a website sidebar or newsletter.',
    layout: 'stack',
  },
  {
    file: '728x90.png',
    width: 728,
    height: 90,
    maxBytes: 100_000,
    name: 'Website strip',
    purpose: 'For the top of a web page on a computer.',
    layout: 'strip',
  },
];
