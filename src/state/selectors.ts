import type { Sighting, StoreData, Trip } from '../domain/types';

export function selectActiveTrip(data: StoreData): Trip | undefined {
  return data.trips.find((t) => t.id === data.activeTripId && !t.deletedAt);
}

/** All trips that haven't been deleted, newest first. */
export function selectTrips(data: StoreData): Trip[] {
  return data.trips
    .filter((t) => !t.deletedAt)
    .toSorted((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

/**
 * The trip the Timeline and Stats tabs should show: the one the user picked,
 * else the active trip, else the most recent.
 */
export function selectViewedTrip(data: StoreData, pickedId: string | null): Trip | undefined {
  const trips = selectTrips(data);
  return (
    trips.find((t) => t.id === pickedId) ??
    trips.find((t) => t.id === data.activeTripId) ??
    trips[0]
  );
}

export function selectTripSightings(data: StoreData, tripId: string): Sighting[] {
  return data.sightings.filter((s) => s.tripId === tripId && !s.deletedAt);
}

export function countByRegion(sightings: readonly Sighting[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of sightings) counts.set(s.regionId, (counts.get(s.regionId) ?? 0) + 1);
  return counts;
}

/** The most recent sighting of a region, by when it was seen. */
export function lastSightingFor(
  sightings: readonly Sighting[],
  regionId: string,
): Sighting | undefined {
  let latest: Sighting | undefined;
  for (const s of sightings) {
    if (s.regionId !== regionId) continue;
    if (!latest || Date.parse(s.seenAt) > Date.parse(latest.seenAt)) latest = s;
  }
  return latest;
}
