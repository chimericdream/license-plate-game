import {
  COUNTRIES,
  REGIONS,
  getRegion,
  regionsFor,
  type Country,
  type Region,
} from '../data/regions';
import { distanceMiles } from './geo';
import { wallClock } from './time';
import type { Sighting } from './types';

/** The moment a region was first seen on the trip, and how many were found by then. */
export interface Discovery {
  /** Epoch milliseconds. */
  at: number;
  count: number;
  regionId: string;
  /** The stored time, for showing the wall-clock moment it happened. */
  seenAt: string;
}

export interface DayStats {
  /** Local calendar date where the plates were seen (`YYYY-MM-DD`). */
  date: string;
  plates: number;
  newRegions: number;
}

export interface CountryProgress {
  country: Country;
  label: string;
  found: number;
  total: number;
}

export interface TripStats {
  plates: number;
  regionsFound: number;
  regionsTotal: number;
  byCountry: CountryProgress[];
  missing: Region[];
  /** Regions seen more than once, most-seen first. */
  repeats: { region: Region; count: number }[];
  firstSeenAt: number | null;
  lastSeenAt: number | null;
  /** Minutes from the first plate to the last. */
  spanMinutes: number | null;
  /** Straight-line miles between consecutive located sightings (a lower bound). */
  approxMiles: number;
  located: number;
  unlocated: number;
  discoveries: Discovery[];
  perDay: DayStats[];
  /** Average minutes between new regions, once there are at least two. */
  minutesPerNewRegion: number | null;
}

export function computeTripStats(sightings: readonly Sighting[]): TripStats {
  const sorted = sightings.toSorted((a, b) => Date.parse(a.seenAt) - Date.parse(b.seenAt));

  const counts = new Map<string, number>();
  const discoveries: Discovery[] = [];
  const days = new Map<string, DayStats>();
  let approxMiles = 0;
  let previous: Sighting | undefined;
  let located = 0;

  for (const sighting of sorted) {
    const at = Date.parse(sighting.seenAt);
    const isNew = !counts.has(sighting.regionId);
    counts.set(sighting.regionId, (counts.get(sighting.regionId) ?? 0) + 1);
    if (isNew)
      discoveries.push({
        at,
        count: discoveries.length + 1,
        regionId: sighting.regionId,
        seenAt: sighting.seenAt,
      });

    const { date } = wallClock(sighting.seenAt);
    const day = days.get(date) ?? { date, plates: 0, newRegions: 0 };
    day.plates += 1;
    if (isNew) day.newRegions += 1;
    days.set(date, day);

    if (sighting.location) {
      located += 1;
      if (previous?.location) approxMiles += distanceMiles(previous.location, sighting.location);
      previous = sighting;
    }
  }

  const first = sorted[0];
  const last = sorted.at(-1);
  const firstSeenAt = first ? Date.parse(first.seenAt) : null;
  const lastSeenAt = last ? Date.parse(last.seenAt) : null;
  const firstDiscovery = discoveries[0];
  const lastDiscovery = discoveries.at(-1);

  return {
    plates: sorted.length,
    regionsFound: counts.size,
    regionsTotal: REGIONS.length,
    byCountry: COUNTRIES.map((c) => ({
      country: c.id,
      label: c.label,
      found: regionsFor(c.id).filter((r) => counts.has(r.id)).length,
      total: regionsFor(c.id).length,
    })),
    missing: REGIONS.filter((r) => !counts.has(r.id)),
    repeats: [...counts]
      .filter(([, count]) => count > 1)
      .flatMap(([id, count]) => {
        const region = getRegion(id);
        return region ? [{ region, count }] : [];
      })
      .toSorted((a, b) => b.count - a.count || a.region.name.localeCompare(b.region.name)),
    firstSeenAt,
    lastSeenAt,
    spanMinutes:
      firstSeenAt !== null && lastSeenAt !== null ? (lastSeenAt - firstSeenAt) / 60_000 : null,
    approxMiles,
    located,
    unlocated: sorted.length - located,
    discoveries,
    perDay: [...days.values()].toSorted((a, b) => a.date.localeCompare(b.date)),
    minutesPerNewRegion:
      firstDiscovery && lastDiscovery && discoveries.length >= 2
        ? (lastDiscovery.at - firstDiscovery.at) / 60_000 / (discoveries.length - 1)
        : null,
  };
}
