import { distanceMiles } from './geo';
import { minutesBetween } from './time';
import type { GeoFix, Sighting } from './types';

/**
 * A repeat sighting of the same region within a trip is only allowed after
 * BOTH this much time and this much distance since the last one. That stops
 * spam-tapping the state you're currently driving through while still letting
 * a long haul across Colorado count more than once.
 */
export const COOLDOWN_MINUTES = 30;
export const COOLDOWN_MILES = 25;

export interface CooldownBlock {
  minutesAgo: number;
  /** null when either position is unknown. */
  milesAway: number | null;
  tooSoon: boolean;
  tooClose: boolean;
}

/** Returns null when the sighting is allowed, otherwise why it was blocked. */
export function checkCooldown(args: {
  last: Sighting | undefined;
  fix: GeoFix | null;
  now: Date;
}): CooldownBlock | null {
  const { last, fix, now } = args;
  if (!last) return null;

  const minutesAgo = minutesBetween(last.seenAt, now);
  const milesAway = last.location && fix ? distanceMiles(last.location, fix) : null;

  const tooSoon = minutesAgo < COOLDOWN_MINUTES;
  // Without both positions we can only judge by time.
  const tooClose = milesAway !== null && milesAway < COOLDOWN_MILES;

  if (!tooSoon && !tooClose) return null;
  return { minutesAgo, milesAway, tooSoon, tooClose };
}
