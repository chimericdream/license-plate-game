import type { GeoFix, Sighting, StoreData, Trip } from '../domain/types';
import { migrate } from './migrate';

export const BACKUP_FORMAT = 'plate-trip-backup';
const BACKUP_FORMAT_VERSION = 1;

/** The whole store wrapped with enough metadata to recognise it later. */
export function createBackup(data: StoreData, now: Date): string {
  return JSON.stringify(
    {
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      exportedAt: now.toISOString(),
      data,
    },
    null,
    2,
  );
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `plate-trip-backup-2026-11-21.json`, using the local calendar date. */
export function backupFilename(now: Date): string {
  return `plate-trip-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isText = (value: unknown): value is string => typeof value === 'string';
const isTime = (value: unknown): value is string =>
  isText(value) && !Number.isNaN(Date.parse(value));
const isNullableTime = (value: unknown) => value === null || isTime(value);

function isGeoFix(value: unknown): value is GeoFix {
  return (
    isRecord(value) &&
    typeof value.lat === 'number' &&
    typeof value.lng === 'number' &&
    Math.abs(value.lat) <= 90 &&
    Math.abs(value.lng) <= 180 &&
    (value.accuracy === null || typeof value.accuracy === 'number') &&
    isTime(value.capturedAt)
  );
}

function hasSyncFields(value: Record<string, unknown>): boolean {
  return (
    isText(value.id) &&
    value.id !== '' &&
    isTime(value.createdAt) &&
    isTime(value.updatedAt) &&
    isNullableTime(value.deletedAt)
  );
}

function isTrip(value: unknown): value is Trip {
  return (
    isRecord(value) &&
    hasSyncFields(value) &&
    isText(value.name) &&
    isTime(value.startedAt) &&
    isNullableTime(value.endedAt)
  );
}

function isSighting(value: unknown): value is Sighting {
  return (
    isRecord(value) &&
    hasSyncFields(value) &&
    isText(value.tripId) &&
    isText(value.regionId) &&
    isTime(value.seenAt) &&
    isText(value.note) &&
    (value.location === null || isGeoFix(value.location))
  );
}

/**
 * Reads a backup file (or a bare copy of the store) into current-version
 * data. Throws a readable error rather than importing anything doubtful.
 */
export function parseBackup(text: string): StoreData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }

  let payload = parsed;
  if (isRecord(parsed) && 'format' in parsed) {
    if (parsed.format !== BACKUP_FORMAT) throw new Error('That file is not a Plate Trip backup.');
    payload = parsed.data;
  }
  if (!isRecord(payload)) throw new Error('That file is not a Plate Trip backup.');

  const data = migrate(payload);
  const badTrips = data.trips.filter((t) => !isTrip(t)).length;
  const badSightings = data.sightings.filter((s) => !isSighting(s)).length;
  if (badTrips || badSightings) {
    throw new Error(
      `The backup is damaged: ${badTrips} trip(s) and ${badSightings} plate(s) are malformed.`,
    );
  }
  return data;
}

export interface MergeStats {
  tripsAdded: number;
  tripsUpdated: number;
  sightingsAdded: number;
  sightingsUpdated: number;
}

function mergeById<T extends { id: string; updatedAt: string }>(
  current: readonly T[],
  incoming: readonly T[],
): { items: T[]; added: number; updated: number } {
  const items = [...current];
  const indexById = new Map(items.map((item, index) => [item.id, index]));
  let added = 0;
  let updated = 0;

  for (const item of incoming) {
    const index = indexById.get(item.id);
    if (index === undefined) {
      indexById.set(item.id, items.length);
      items.push(item);
      added += 1;
    } else if (Date.parse(item.updatedAt) > Date.parse(items[index]!.updatedAt)) {
      items[index] = item;
      updated += 1;
    }
  }
  return { items, added, updated };
}

/**
 * Combines two sets of data by id; on a conflict the more recently updated
 * record wins. Deletions travel as soft-delete markers, so a delete made later
 * than the other copy's edit is kept.
 */
export function mergeStoreData(
  current: StoreData,
  incoming: StoreData,
): { data: StoreData; stats: MergeStats } {
  const trips = mergeById(current.trips, incoming.trips);
  const sightings = mergeById(current.sightings, incoming.sightings);

  const isOpenTrip = (id: string | null) =>
    id !== null && trips.items.some((t) => t.id === id && !t.deletedAt && !t.endedAt);
  const activeTripId = isOpenTrip(current.activeTripId)
    ? current.activeTripId
    : isOpenTrip(incoming.activeTripId)
      ? incoming.activeTripId
      : null;

  return {
    data: {
      schemaVersion: current.schemaVersion,
      activeTripId,
      trips: trips.items,
      sightings: sightings.items,
    },
    stats: {
      tripsAdded: trips.added,
      tripsUpdated: trips.updated,
      sightingsAdded: sightings.added,
      sightingsUpdated: sightings.updated,
    },
  };
}

/** Counts of things the user can see (not soft-deleted). */
export function countLive(data: StoreData): { trips: number; sightings: number } {
  return {
    trips: data.trips.filter((t) => !t.deletedAt).length,
    sightings: data.sightings.filter((s) => !s.deletedAt).length,
  };
}
