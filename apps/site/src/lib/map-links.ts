// The map-link builder, typed for build-time code (src/pages/go.astro and
// the tests). The builder itself is public/scripts/map-links.js, so the
// browser can import the same code; read that file's header for the link
// formats.
import { buildMapLinks as build } from '../../public/scripts/map-links.js';

export interface MapLinks {
  google: string;
  apple: string;
  transit: string;
  labels: {
    google: string;
    apple: string;
    transit: string;
  };
}

/**
 * Builds the Google Maps, Apple Maps and Transit app deep links for one
 * destination, plus a screen-reader label for each button. Throws when
 * `lat` or `lng` is not a number in range.
 */
export const buildMapLinks: (lat: number, lng: number, name: string) => MapLinks = build;
