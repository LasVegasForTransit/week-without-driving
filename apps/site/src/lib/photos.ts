// Photos the site uses, with the credit each license asks for. Files live in
// public/photos as WebP at the listed widths (name-<width>.webp). These are
// freely licensed photos from Wikimedia Commons, used until LVBT has its own
// photos of Las Vegans taking part; swap an entry's files and credit to
// replace one.
export interface Photo {
  /** File name stem in public/photos, without the width or extension. */
  name: string;
  widths: readonly number[];
  /** Intrinsic width and height of the largest file, for layout. */
  width: number;
  height: number;
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
    alt: 'The Las Vegas Strip seen from the top deck of the Deuce bus, heading south.',
    credit: 'David Shane',
    license: 'CC BY 2.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/2.0/',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:Photo_from_The_Deuce_bus,_heading_south.jpg',
  },
  rtcBusMlk: {
    name: 'rtc-bus-mlk',
    widths: [480, 960],
    width: 960,
    height: 540,
    alt: 'An RTC articulated bus on Route 105, North MLK, at a stop in Las Vegas.',
    credit: 'Baconunquiealt',
    license: 'CC0',
    licenseUrl: null,
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:RTCLV_2022_XN60.jpg',
  },
  rtcBusStreet: {
    name: 'rtc-bus-street',
    widths: [480, 960],
    width: 960,
    height: 448,
    alt: 'An RTC articulated bus driving down a Las Vegas street.',
    credit: 'Rtcbusfanner',
    license: 'CC0',
    licenseUrl: null,
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:RTCLV2022XN60.jpg',
  },
} as const satisfies Record<string, Photo>;
