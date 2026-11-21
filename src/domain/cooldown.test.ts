import { describe, expect, it } from 'vitest';
import { checkCooldown } from './cooldown';
import { distanceMiles } from './geo';
import type { GeoFix, Sighting } from './types';

const denver = { lat: 39.7392, lng: -104.9903 };
const grandJunction = { lat: 39.0639, lng: -108.5506 }; // ~ 196 mi away
const aurora = { lat: 39.7294, lng: -104.8319 }; // ~ 9 mi away

const fix = (p: { lat: number; lng: number }): GeoFix => ({
  ...p,
  accuracy: 10,
  capturedAt: '2026-11-21T12:00:00.000Z',
});

const sighting = (seenAt: string, loc: GeoFix | null): Sighting => ({
  id: 's1',
  tripId: 't1',
  regionId: 'US-CO',
  seenAt,
  location: loc,
  note: '',
  createdAt: seenAt,
  updatedAt: seenAt,
  deletedAt: null,
});

const at = (iso: string) => new Date(iso);

describe('distanceMiles', () => {
  it('is roughly right for Denver to Grand Junction', () => {
    expect(distanceMiles(denver, grandJunction)).toBeGreaterThan(190);
    expect(distanceMiles(denver, grandJunction)).toBeLessThan(205);
  });
  it('is zero for the same point', () => {
    expect(distanceMiles(denver, denver)).toBeCloseTo(0, 6);
  });
});

describe('checkCooldown', () => {
  const last = sighting('2026-11-21T12:00:00.000Z', fix(denver));

  it('allows the first sighting', () => {
    expect(
      checkCooldown({
        last: undefined,
        fix: null,
        now: at('2026-11-21T12:00:00Z'),
      }),
    ).toBeNull();
  });

  it('blocks a quick repeat in the same place', () => {
    const block = checkCooldown({
      last,
      fix: fix(denver),
      now: at('2026-11-21T12:04:00.000Z'),
    });
    expect(block?.tooSoon).toBe(true);
    expect(block?.tooClose).toBe(true);
    expect(Math.round(block?.minutesAgo ?? 0)).toBe(4);
  });

  it('blocks when enough time passed but you have not gone far', () => {
    const block = checkCooldown({
      last,
      fix: fix(aurora),
      now: at('2026-11-21T14:00:00.000Z'),
    });
    expect(block).toMatchObject({ tooSoon: false, tooClose: true });
  });

  it('blocks when you moved far but too little time passed', () => {
    const block = checkCooldown({
      last,
      fix: fix(grandJunction),
      now: at('2026-11-21T12:10:00.000Z'),
    });
    expect(block).toMatchObject({ tooSoon: true, tooClose: false });
  });

  it('allows once both time and distance are satisfied', () => {
    expect(
      checkCooldown({
        last,
        fix: fix(grandJunction),
        now: at('2026-11-21T15:00:00.000Z'),
      }),
    ).toBeNull();
  });

  it('falls back to time alone when a position is missing', () => {
    expect(checkCooldown({ last, fix: null, now: at('2026-11-21T12:10:00.000Z') })).toMatchObject({
      tooSoon: true,
      milesAway: null,
    });
    expect(checkCooldown({ last, fix: null, now: at('2026-11-21T13:00:00.000Z') })).toBeNull();
    expect(
      checkCooldown({
        last: sighting('2026-11-21T12:00:00.000Z', null),
        fix: fix(denver),
        now: at('2026-11-21T13:00:00.000Z'),
      }),
    ).toBeNull();
  });
});
