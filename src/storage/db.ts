import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Photo, Sighting, Trip } from '../domain/types';

export const DB_NAME = 'plate-trip';
const DB_VERSION = 1;

/** The two renditions kept for every photo. */
export interface PhotoBlobs {
  full: Blob;
  thumb: Blob;
}

export interface StoredMeta {
  schemaVersion: number;
  activeTripId: string | null;
}

interface PlateTripDB extends DBSchema {
  /** A single record (key "state") with the app-level fields. */
  meta: { key: string; value: StoredMeta };
  trips: { key: string; value: Trip };
  sightings: { key: string; value: Sighting };
  photos: { key: string; value: Photo; indexes: { sightingId: string } };
  /** Image data, kept apart from the metadata so listing photos stays cheap. */
  photoBlobs: { key: string; value: PhotoBlobs };
}

export type PlateDb = IDBPDatabase<PlateTripDB>;

export function openPlateDb(name = DB_NAME): Promise<PlateDb> {
  return openDB<PlateTripDB>(name, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('meta');
      db.createObjectStore('trips', { keyPath: 'id' });
      db.createObjectStore('sightings', { keyPath: 'id' });
      db.createObjectStore('photos', { keyPath: 'id' }).createIndex('sightingId', 'sightingId');
      db.createObjectStore('photoBlobs');
    },
    blocking() {
      // A newer version of the app wants to upgrade the database; get out of the way.
      void db?.then((open) => open.close());
    },
  });
}

let db: Promise<PlateDb> | undefined;

/** The app's shared database connection, opened on first use. */
export function sharedDb(): Promise<PlateDb> {
  db ??= openPlateDb();
  return db;
}
