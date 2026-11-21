import type { StoreData } from '../domain/types';

export const SCHEMA_VERSION = 1;

export function emptyStoreData(): StoreData {
  return {
    schemaVersion: SCHEMA_VERSION,
    activeTripId: null,
    trips: [],
    sightings: [],
  };
}

/**
 * Each entry upgrades data from version N to N + 1. Add one here (and bump
 * SCHEMA_VERSION) whenever the stored shape changes.
 */
const MIGRATIONS: Record<number, (data: Record<string, unknown>) => Record<string, unknown>> = {};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Turns whatever was stored (or nothing) into current-version data. */
export function migrate(raw: unknown): StoreData {
  if (raw === null || raw === undefined) return emptyStoreData();
  if (!isRecord(raw)) throw new Error('Stored data is not an object');

  let data = raw;
  let version = data.schemaVersion;
  if (typeof version !== 'number') throw new Error('Stored data has no schemaVersion');
  if (version > SCHEMA_VERSION) {
    throw new Error(
      `Stored data is from a newer version of the app (schema ${version}, this app understands ${SCHEMA_VERSION})`,
    );
  }

  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new Error(`No migration from schema ${version}`);
    data = { ...step(data), schemaVersion: version + 1 };
    version += 1;
  }

  if (!Array.isArray(data.trips) || !Array.isArray(data.sightings)) {
    throw new Error('Stored data is missing trips or sightings');
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    activeTripId: typeof data.activeTripId === 'string' ? data.activeTripId : null,
    trips: data.trips as StoreData['trips'],
    sightings: data.sightings as StoreData['sightings'],
  };
}
