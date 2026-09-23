/* The shared deep-link builder, browser copy. Same logic as
 * src/lib/map-links.ts (read that file's header first) — kept as plain JS
 * here because this file is loaded as a classic <script src> under the
 * site's `script-src 'self'` Content Security Policy (see
 * public/_headers) and cannot import a TypeScript module.
 *
 * The nearest-route finder (nearest-routes.js) calls
 * window.LVWWD_MAP_LINKS.buildMapLinks() for every stop in its results,
 * once the visitor shares a location or picks a place, since those stops
 * are not known at build time the way the "Places to go" destinations are.
 */
(() => {
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

  window.LVWWD_MAP_LINKS = { buildMapLinks };
})();
