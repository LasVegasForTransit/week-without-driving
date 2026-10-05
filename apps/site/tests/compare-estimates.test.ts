import { describe, expect, it } from 'vitest';

import {
  METERS_PER_MILE,
  estimateCarbon,
  estimateCost,
} from '../public/modules/compare-estimates.js';

describe('one-way comparison estimates', () => {
  it('uses the published EPA factors and fuel formula', () => {
    expect(estimateCarbon('drive', METERS_PER_MILE * 10, null)).toBeCloseTo(2.985697, 6);
    expect(estimateCarbon('bus', METERS_PER_MILE * 10, METERS_PER_MILE * 6)).toBeCloseTo(
      0.3997938,
      6,
    );
    expect(
      estimateCost('drive', METERS_PER_MILE * 22.2, { fare: null, gasPrice: 4, parking: 3 }),
    ).toBeCloseTo(7);
  });

  it('keeps missing bus values unknown and reports no tailpipe for active modes', () => {
    expect(estimateCarbon('bus', 1000, null)).toBeNull();
    expect(estimateCost('bus', 1000, { fare: null, gasPrice: 4, parking: 0 })).toBeNull();
    expect(estimateCost('bus', 1000, { fare: 2.5, gasPrice: 4, parking: 0 })).toBe(2.5);
    for (const mode of ['walk', 'bike', 'scooter']) {
      expect(estimateCarbon(mode, 1000, null)).toBe(0);
      expect(estimateCost(mode, 1000, { fare: null, gasPrice: 4, parking: 0 })).toBe(0);
    }
  });
});
