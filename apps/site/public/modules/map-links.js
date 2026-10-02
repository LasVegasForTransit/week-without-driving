/* The shared deep-link builder: turns a place's latitude, longitude and
 * name into the three map links the site uses everywhere it sends a
 * visitor toward a stop or a destination (Google Maps, Apple Maps and the
 * Transit app), plus each button's name for screen readers.
 *
 * This file is the only copy. The browser imports it: Find a bus
 * (nearest-routes.js) builds links for stops it only knows about after the
 * visitor shares a location or picks a place. The build imports it too,
 * through src/lib/map-links.ts, which gives it types for the "Places to
 * go" buttons on /go.
 *
 * Link formats:
 *   Google Maps:  https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>&travelmode=transit
 *   Apple Maps:   https://maps.apple.com/?daddr=<lat>,<lng>&dirflg=r   (dirflg=r asks for transit directions)
 *   Transit app:  transit://directions?to=<lat>,<lng>   (no `from` value, so the app starts from the rider's location)
 *
 * buildMapLinks throws when `lat` or `lng` is not a number in range, naming
 * the bad value, so a wrong coordinate stops the site build instead of
 * reaching a visitor.
 */
function formatCoordinate(value, label) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`${label} must be a number, got ${String(value)}`);
  }
  return value.toFixed(5);
}

/** A query value with commas left as they are, as the map apps write "lat,lng". */
const queryValue = (text) => encodeURIComponent(text).replace(/%2C/gi, ',');

/**
 * Transit directions to `to` (a "lat,lng" point, an address or a place
 * name) in the three map apps, starting from `from` or, without one, from
 * where the phone is. The Transit app takes only a map point and always
 * starts from the phone, so its link is '' unless `point` is given and
 * `from` is not. "Where to?" on /go uses this for places people type.
 */
function buildDirectionLinks(to, name, { from = '', point = '' } = {}) {
  const origin = from ? `&origin=${queryValue(from)}` : '';
  const start = from ? `&saddr=${queryValue(from)}` : '';
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${queryValue(to)}${origin}&travelmode=transit`,
    apple: `https://maps.apple.com/?daddr=${queryValue(to)}${start}&dirflg=r`,
    transit: point && !from ? `transit://directions?to=${point}` : '',
    labels: {
      google: `Directions to ${name} in Google Maps`,
      apple: `Directions to ${name} in Apple Maps`,
      transit: `Directions to ${name} in the Transit app`,
    },
  };
}

function buildMapLinks(lat, lng, name) {
  if (typeof lat !== 'number' || Number.isNaN(lat) || lat < -90 || lat > 90) {
    throw new Error(`latitude out of range (-90 to 90): ${String(lat)}`);
  }
  if (typeof lng !== 'number' || Number.isNaN(lng) || lng < -180 || lng > 180) {
    throw new Error(`longitude out of range (-180 to 180): ${String(lng)}`);
  }
  const point = `${formatCoordinate(lat, 'latitude')},${formatCoordinate(lng, 'longitude')}`;
  return buildDirectionLinks(point, name, { point });
}

export { buildDirectionLinks, buildMapLinks };
