// Photos the site uses, with the credit each license asks for. These are
// freely licensed photos from Wikimedia Commons, used until LVBT has its own
// photos of Las Vegans taking part.
//
// Files live in public/photos as name-<width>.avif and name-<width>.webp,
// one pair per listed width. Phones that show AVIF (nearly all of them)
// download the smaller AVIF; the WebP is the fallback. The largest WebP is
// the master copy: scripts/build-photos.mjs makes every other file from it.
// To replace a photo, put its new master in public/photos, update the entry
// here, and run `pnpm photos` from apps/site.
export interface Photo {
  /** File name stem in public/photos, without the width or extension. */
  name: string;
  /** Widths made in both formats; the largest is the master. */
  widths: readonly number[];
  /** Intrinsic width and height of the largest file, for layout. */
  width: number;
  height: number;
  /**
   * A narrower crop for phones held upright, where the photo fills a tall
   * frame and only its middle shows anyway: name-phone-<width>.avif/.webp,
   * cut from the middle of the master at this width-to-height ratio. It
   * shows the same part of the photo while downloading far less.
   */
  phone?: { aspect: number; widths: readonly number[] };
  /** AVIF quality, 1 to 100. Lower is smaller; 45 is sharp for photos. */
  quality: number;
  alt: string;
  credit: string;
  license: string;
  licenseUrl: string | null;
  sourceUrl: string;
}

export const photos = {
  deuceView: {
    name: 'hero',
    widths: [800, 1200, 1600],
    width: 1600,
    height: 1229,
    // The home hero: under a dark shade, behind text, so it takes a lower
    // quality without looking any different.
    phone: { aspect: 0.8, widths: [480, 720] },
    quality: 40,
    alt: 'The Las Vegas Strip seen from the top deck of the Deuce bus, heading south.',
    credit: 'David Shane',
    license: 'CC BY 2.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/2.0/',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:Photo_from_The_Deuce_bus,_heading_south.jpg',
  },
  rtcBusMlk: {
    name: 'rtc-bus-mlk',
    widths: [320, 480, 640, 960],
    width: 960,
    height: 540,
    quality: 45,
    alt: 'An RTC articulated bus on Route 105, North MLK, at a stop in Las Vegas.',
    credit: 'Baconunquiealt',
    license: 'CC0',
    licenseUrl: null,
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:RTCLV_2022_XN60.jpg',
  },
  rtcBusStreet: {
    name: 'rtc-bus-street',
    widths: [320, 480, 640, 960],
    width: 960,
    height: 448,
    quality: 45,
    alt: 'An RTC articulated bus driving down a Las Vegas street.',
    credit: 'Rtcbusfanner',
    license: 'CC0',
    licenseUrl: null,
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:RTCLV2022XN60.jpg',
  },
} as const satisfies Record<string, Photo>;
