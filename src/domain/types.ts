export interface GeoFix {
  lat: number;
  lng: number;
  /** Horizontal accuracy in meters, when the device reports it. */
  accuracy: number | null;
  /** ISO timestamp of when the fix was taken (not when it was attached). */
  capturedAt: string;
}

interface Syncable {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** Soft delete, so a future sync can propagate removals. */
  deletedAt: string | null;
}

export interface Trip extends Syncable {
  name: string;
  startedAt: string;
  endedAt: string | null;
}

export interface Sighting extends Syncable {
  tripId: string;
  regionId: string;
  seenAt: string;
  location: GeoFix | null;
  note: string;
  /**
   * Town name looked up from the coordinates (e.g. "Grand Junction, Colorado").
   * undefined = not looked up yet, null = looked up but nothing was found.
   */
  place?: string | null;
}

/** Metadata for a photo; the image data itself lives in a separate store. */
export interface Photo extends Syncable {
  sightingId: string;
  tripId: string;
  /** Pixel size of the stored full-size image. */
  width: number;
  height: number;
  /** Size in bytes of the stored full-size JPEG. */
  bytes: number;
}

export interface StoreData {
  schemaVersion: number;
  activeTripId: string | null;
  trips: Trip[];
  sightings: Sighting[];
}
