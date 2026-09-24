// The shared deep-link builder: turns a place's latitude, longitude and
// name into the three map links the site uses everywhere it sends a
// visitor toward a stop or a destination (Google Maps, Apple Maps and the
// Transit app), plus each button's name for screen readers. The "Places to
// go" destinations on /go use it at build time (src/pages/go.astro).
//
// The "Find a bus" finder needs the same builder in the browser, for stops
// it only knows about after the visitor shares a location or picks a
// place. A `public/scripts/*.js` file (loaded under the site's
// `script-src 'self'` Content Security Policy, see public/_headers) cannot
// import a TypeScript module, so public/scripts/map-links.js is a plain-JS
// copy of the same logic. Keep the two in sync: tests/map-links.test.ts
// checks that both give the same links and names.
//
// Link formats:
//   Google Maps:  https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>&travelmode=transit
//   Apple Maps:   https://maps.apple.com/?daddr=<lat>,<lng>&dirflg=r   (dirflg=r asks for transit directions)
//   Transit app:  transit://directions?to=<lat>,<lng>   (no `from` value, so the app starts from the rider's location)

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

function formatCoordinate(value: number, label: string): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`${label} must be a number, got ${String(value)}`);
  }
  return value.toFixed(5);
}

/**
 * Builds the Google Maps, Apple Maps and Transit app deep links for one
 * destination, plus a screen-reader label for each button. Throws when
 * `lat` or `lng` is not a number in range, naming the bad value, so a wrong
 * coordinate stops the site build instead of reaching a visitor.
 */
export function buildMapLinks(lat: number, lng: number, name: string): MapLinks {
  if (typeof lat !== 'number' || Number.isNaN(lat) || lat < -90 || lat > 90) {
    throw new Error(`latitude out of range (-90 to 90): ${String(lat)}`);
  }
  if (typeof lng !== 'number' || Number.isNaN(lng) || lng < -180 || lng > 180) {
    throw new Error(`longitude out of range (-180 to 180): ${String(lng)}`);
  }
  const latStr = formatCoordinate(lat, 'latitude');
  const lngStr = formatCoordinate(lng, 'longitude');
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${latStr},${lngStr}&travelmode=transit`,
    apple: `https://maps.apple.com/?daddr=${latStr},${lngStr}&dirflg=r`,
    transit: `transit://directions?to=${latStr},${lngStr}`,
    labels: {
      google: `Directions to ${name} in Google Maps`,
      apple: `Directions to ${name} in Apple Maps`,
      transit: `Directions to ${name} in the Transit app`,
    },
  };
}
