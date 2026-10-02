/** One-way operating estimates. Route distances come from Google Maps in meters. */
export const METERS_PER_MILE = 1609.344;
export const DRIVE_KG_PER_MILE = 0.297 + (0.0059 * 28) / 1000 + (0.0053 * 265) / 1000;
export const BUS_KG_PER_MILE = 0.066 + (0.0046 * 28) / 1000 + (0.0019 * 265) / 1000;

export function estimateCost(mode, meters, { fare, gasPrice, parking }) {
  if (mode === 'drive') return (meters / METERS_PER_MILE / 22.2) * gasPrice + parking;
  if (mode === 'bus') return typeof fare === 'number' ? fare : null;
  return 0;
}

export function estimateCarbon(mode, meters, busMeters) {
  if (mode === 'drive') return (meters / METERS_PER_MILE) * DRIVE_KG_PER_MILE;
  if (mode === 'bus')
    return typeof busMeters === 'number' ? (busMeters / METERS_PER_MILE) * BUS_KG_PER_MILE : null;
  return 0;
}
