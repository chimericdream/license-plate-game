import { describe, expect, it } from 'vitest';
import { computeTripStats } from './stats';
import type { Sighting } from './types';

let n = 0;
function sighting(regionId: string, seenAt: string, location?: [number, number]): Sighting {
  n += 1;
  return {
    id: `s${n}`,
    tripId: 't',
    regionId,
    seenAt,
    location: location
      ? { lat: location[0], lng: location[1], accuracy: 5, capturedAt: seenAt }
      : null,
    note: '',
    createdAt: seenAt,
    updatedAt: seenAt,
    deletedAt: null,
  };
}

describe('computeTripStats', () => {
  it('handles an empty trip', () => {
    const stats = computeTripStats([]);
    expect(stats).toMatchObject({
      plates: 0,
      regionsFound: 0,
      spanMinutes: null,
      approxMiles: 0,
      minutesPerNewRegion: null,
      discoveries: [],
      perDay: [],
    });
    expect(stats.missing).toHaveLength(96);
  });

  it('counts plates, regions and per-country progress', () => {
    const stats = computeTripStats([
      sighting('US-CO', '2026-11-21T10:00:00.000-07:00'),
      sighting('US-CO', '2026-11-21T12:00:00.000-07:00'),
      sighting('US-UT', '2026-11-21T13:00:00.000-07:00'),
      sighting('CA-ON', '2026-11-21T14:00:00.000-07:00'),
    ]);
    expect(stats.plates).toBe(4);
    expect(stats.regionsFound).toBe(3);
    expect(stats.byCountry.map((c) => [c.country, c.found])).toEqual([
      ['US', 2],
      ['CA', 1],
      ['MX', 0],
    ]);
    expect(stats.missing).toHaveLength(93);
    expect(stats.missing.map((r) => r.id)).not.toContain('US-CO');
  });

  it('lists repeats, most-seen first', () => {
    const stats = computeTripStats([
      sighting('US-CO', '2026-11-21T10:00:00.000Z'),
      sighting('US-UT', '2026-11-21T10:30:00.000Z'),
      sighting('US-CO', '2026-11-21T11:00:00.000Z'),
      sighting('US-CO', '2026-11-21T12:00:00.000Z'),
      sighting('US-UT', '2026-11-21T13:00:00.000Z'),
    ]);
    expect(stats.repeats.map((r) => [r.region.id, r.count])).toEqual([
      ['US-CO', 3],
      ['US-UT', 2],
    ]);
  });

  it('records discoveries in time order regardless of input order', () => {
    const stats = computeTripStats([
      sighting('US-UT', '2026-11-21T13:00:00.000Z'),
      sighting('US-CO', '2026-11-21T10:00:00.000Z'),
      sighting('US-CO', '2026-11-21T11:00:00.000Z'),
    ]);
    expect(stats.discoveries.map((d) => [d.regionId, d.count])).toEqual([
      ['US-CO', 1],
      ['US-UT', 2],
    ]);
    expect(stats.spanMinutes).toBe(180);
    expect(stats.minutesPerNewRegion).toBe(180);
  });

  it('groups by the local day the plate was seen', () => {
    const stats = computeTripStats([
      sighting('US-CO', '2026-11-21T23:30:00.000-07:00'),
      sighting('US-UT', '2026-11-22T00:30:00.000-07:00'),
      sighting('US-UT', '2026-11-22T09:00:00.000-07:00'),
    ]);
    expect(stats.perDay).toEqual([
      { date: '2026-11-21', plates: 1, newRegions: 1 },
      { date: '2026-11-22', plates: 2, newRegions: 1 },
    ]);
  });

  it('sums straight-line distance between located sightings and counts the rest', () => {
    const stats = computeTripStats([
      sighting('US-CO', '2026-11-21T10:00:00.000Z', [39.7392, -104.9903]),
      sighting('US-UT', '2026-11-21T11:00:00.000Z'),
      sighting('US-WY', '2026-11-21T12:00:00.000Z', [39.0639, -108.5506]),
    ]);
    expect(stats.located).toBe(2);
    expect(stats.unlocated).toBe(1);
    // The unlocated one is skipped, so it is Denver straight to Grand Junction.
    expect(stats.approxMiles).toBeGreaterThan(190);
    expect(stats.approxMiles).toBeLessThan(205);
  });
});
