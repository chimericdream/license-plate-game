import type { Sighting, StoreData, Trip } from '../domain/types';
import { sharedDb, type PlateDb, type StoredMeta } from './db';
import { emptyStoreData, migrate } from './migrate';
import type { Repository } from './repository';

/** Keys the app used before it moved to IndexedDB; anything under them is leftover test data. */
const LEGACY_PREFIX = 'plate-trip:data';

type LegacyStorage = Pick<Storage, 'removeItem' | 'key' | 'length'>;

function removeLegacyData(storage: LegacyStorage): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key?.startsWith(LEGACY_PREFIX)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  } catch {
    // Not worth failing a launch over.
  }
}

const byCreation = <T extends { createdAt: string; id: string }>(a: T, b: T) =>
  Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id);

/**
 * Trips and sightings in IndexedDB, one record each, so a save only writes
 * what changed.
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
    if (this.legacy) removeLegacyData(this.legacy);
    const db = await this.getDb();
    const tx = db.transaction(['meta', 'trips', 'sightings'], 'readonly');
    const [meta, trips, sightings] = await Promise.all([
      tx.objectStore('meta').get('state'),
      tx.objectStore('trips').getAll(),
      tx.objectStore('sightings').getAll(),
    ]);
    await tx.done;

    if (!meta) {
      this.remember(emptyStoreData());
      return emptyStoreData();
    }

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
}
