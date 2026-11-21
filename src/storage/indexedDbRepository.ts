import type { Sighting, StoreData, Trip } from '../domain/types';
import { sharedDb, type PlateDb, type StoredMeta } from './db';
import { STORAGE_KEY } from './localStorageRepository';
import { emptyStoreData, migrate } from './migrate';
import type { Repository } from './repository';

/** Where the pre-IndexedDB copy of the data is kept after it has been moved. */
export const LEGACY_BACKUP_KEY = `${STORAGE_KEY}:before-indexeddb`;

type LegacyStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const byCreation = <T extends { createdAt: string; id: string }>(a: T, b: T) =>
  Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id);

/**
 * Trips and sightings in IndexedDB, one record each, so a save only writes
 * what changed. On first run it moves any data from the old localStorage
 * repository across, keeping a copy of the original.
 */
export class IndexedDbRepository implements Repository {
  private written = {
    trips: new Map<string, Trip>(),
    sightings: new Map<string, Sighting>(),
    meta: '',
  };
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly getDb: () => Promise<PlateDb> = sharedDb,
    private readonly legacy: LegacyStorage | null = typeof localStorage === 'undefined'
      ? null
      : localStorage,
  ) {}

  async load(): Promise<StoreData> {
    const db = await this.getDb();
    const tx = db.transaction(['meta', 'trips', 'sightings'], 'readonly');
    const [meta, trips, sightings] = await Promise.all([
      tx.objectStore('meta').get('state'),
      tx.objectStore('trips').getAll(),
      tx.objectStore('sightings').getAll(),
    ]);
    await tx.done;

    if (!meta) return this.importLegacy();

    const data = migrate({
      schemaVersion: meta.schemaVersion,
      activeTripId: meta.activeTripId,
      trips: trips.toSorted(byCreation),
      sightings: sightings.toSorted(byCreation),
    });
    this.remember(data);
    return data;
  }

  save(data: StoreData): Promise<void> {
    // Saves run one at a time, in order, each carrying the latest snapshot.
    const run = () => this.write(data);
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async write(data: StoreData): Promise<void> {
    const db = await this.getDb();
    const tx = db.transaction(['meta', 'trips', 'sightings'], 'readwrite');
    const trips = tx.objectStore('trips');
    const sightings = tx.objectStore('sightings');
    const pending: Promise<unknown>[] = [];

    const sync = <T extends { id: string }>(
      items: readonly T[],
      before: Map<string, T>,
      store: { put(value: T): Promise<unknown>; delete(key: string): Promise<void> },
    ) => {
      const ids = new Set<string>();
      for (const item of items) {
        ids.add(item.id);
        // Records are never mutated in place, so a changed reference means a changed record.
        if (before.get(item.id) !== item) pending.push(store.put(item));
      }
      for (const id of before.keys()) if (!ids.has(id)) pending.push(store.delete(id));
    };
    sync(data.trips, this.written.trips, trips);
    sync(data.sightings, this.written.sightings, sightings);

    const meta: StoredMeta = { schemaVersion: data.schemaVersion, activeTripId: data.activeTripId };
    const metaKey = JSON.stringify(meta);
    if (metaKey !== this.written.meta) pending.push(tx.objectStore('meta').put(meta, 'state'));

    await Promise.all([...pending, tx.done]);
    this.remember(data);
  }

  private remember(data: StoreData): void {
    this.written = {
      trips: new Map(data.trips.map((t) => [t.id, t])),
      sightings: new Map(data.sightings.map((s) => [s.id, s])),
      meta: JSON.stringify({
        schemaVersion: data.schemaVersion,
        activeTripId: data.activeTripId,
      } satisfies StoredMeta),
    };
  }

  /**
   * Nothing is in IndexedDB yet. If the old localStorage repository has data,
   * copy it over (in one transaction), then park the original under another
   * key so it is never re-imported but is not thrown away either.
   */
  private async importLegacy(): Promise<StoreData> {
    const raw = this.legacy?.getItem(STORAGE_KEY) ?? null;
    if (raw === null || this.legacy === null) return emptyStoreData();

    let data: StoreData;
    try {
      data = migrate(JSON.parse(raw));
    } catch (error) {
      // Same policy as before: never destroy data we can't read.
      const backupKey = `${STORAGE_KEY}:unreadable:${Date.now()}`;
      try {
        this.legacy.setItem(backupKey, raw);
        this.legacy.removeItem(STORAGE_KEY);
      } catch {
        // Out of space; leave the original where it is.
      }
      console.warn(`Could not read stored data; backed up to ${backupKey}`, error);
      return emptyStoreData();
    }

    await this.write(data);
    try {
      this.legacy.setItem(LEGACY_BACKUP_KEY, raw);
      this.legacy.removeItem(STORAGE_KEY);
    } catch {
      // Leave the original in place; it is ignored from now on because IndexedDB has the data.
    }
    return data;
  }
}
