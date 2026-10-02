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

function buildMapLinks(lat, lng, name) {
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

export { buildMapLinks };
