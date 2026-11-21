import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { Photo, Sighting, StoreData, Trip } from '../domain/types';
import { openPlateDb } from './db';
import { IndexedDbRepository, LEGACY_BACKUP_KEY } from './indexedDbRepository';
import { STORAGE_KEY } from './localStorageRepository';
import { emptyStoreData } from './migrate';
import { IndexedDbPhotoRepository } from './photoRepository';

class FakeStorage {
  items = new Map<string, string>();
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
}

function setup(legacy = new FakeStorage()) {
  const name = `test-${crypto.randomUUID()}`;
  const getDb = () => openPlateDb(name);
  return {
    legacy,
    getDb,
    // A new repository over the same database stands in for reopening the app.
    repo: () => new IndexedDbRepository(getDb, legacy),
  };
}

const time = '2026-11-21T10:00:00.000-07:00';

function trip(id: string, overrides: Partial<Trip> = {}): Trip {
  return {
    id,
    name: id,
    startedAt: time,
    endedAt: null,
    createdAt: time,
    updatedAt: time,
    deletedAt: null,
    ...overrides,
  };
}

function sighting(id: string, createdAt = time, overrides: Partial<Sighting> = {}): Sighting {
  return {
    id,
    tripId: 't1',
    regionId: 'US-CO',
    seenAt: createdAt,
    location: null,
    note: '',
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    ...overrides,
  };
}

const store = (overrides: Partial<StoreData> = {}): StoreData => ({
  ...emptyStoreData(),
  ...overrides,
});

describe('IndexedDbRepository', () => {
  it('starts empty and round-trips data across a reopen', async () => {
    const { repo } = setup();
    expect(await repo().load()).toEqual(emptyStoreData());

    const data = store({
      activeTripId: 't1',
      trips: [trip('t1')],
      sightings: [sighting('s1', '2026-11-21T11:00:00.000-07:00')],
    });
    await repo().save(data);
    expect(await repo().load()).toEqual(data);
  });

  it('returns records in the order they were created, not key order', async () => {
    const { repo } = setup();
    const data = store({
      trips: [trip('t1')],
      sightings: [
        sighting('zzz', '2026-11-21T10:00:00.000-07:00'),
        sighting('aaa', '2026-11-21T11:00:00.000-07:00'),
        sighting('mmm', '2026-11-21T12:00:00.000-07:00'),
      ],
    });
    await repo().save(data);
    const loaded = await repo().load();
    expect(loaded.sightings.map((s) => s.id)).toEqual(['zzz', 'aaa', 'mmm']);
  });

  it('writes edits and removals on later saves', async () => {
    const { repo } = setup();
    const writer = repo();
    const first = sighting('s1');
    const second = sighting('s2', '2026-11-21T11:00:00.000-07:00');
    await writer.save(store({ trips: [trip('t1')], sightings: [first, second] }));

    const edited = { ...first, note: 'edited' };
    await writer.save(store({ activeTripId: 't1', trips: [trip('t1')], sightings: [edited] }));

    const loaded = await repo().load();
    expect(loaded.activeTripId).toBe('t1');
    expect(loaded.sightings).toHaveLength(1);
    expect(loaded.sightings[0]?.note).toBe('edited');
  });

  it('keeps saves in order when several are fired at once', async () => {
    const { repo } = setup();
    const writer = repo();
    const saves = [1, 2, 3, 4, 5].map((n) =>
      writer.save(store({ trips: [trip('t1', { name: `name ${n}` })] })),
    );
    await Promise.all(saves);
    expect((await repo().load()).trips[0]?.name).toBe('name 5');
  });

  it('reports a failed save and recovers on the next one', async () => {
    const { getDb } = setup();
    let failNext = false;
    const flaky = new IndexedDbRepository(
      () => (failNext ? Promise.reject(new Error('disk full')) : getDb()),
      new FakeStorage(),
    );
    await flaky.save(store({ trips: [trip('t1')] }));

    failNext = true;
    await expect(flaky.save(store({ trips: [trip('t1', { name: 'lost' })] }))).rejects.toThrow(
      'disk full',
    );

    failNext = false;
    await flaky.save(store({ trips: [trip('t1', { name: 'later' })] }));
    const reopened = new IndexedDbRepository(getDb, new FakeStorage());
    expect((await reopened.load()).trips[0]?.name).toBe('later');
  });

  it('rejects data written by a newer version of the app', async () => {
    const { repo, getDb } = setup();
    const db = await getDb();
    await db.put('meta', { schemaVersion: 999, activeTripId: null }, 'state');
    db.close();
    await expect(repo().load()).rejects.toThrow(/newer version/);
  });
});

describe('moving from localStorage', () => {
  const legacyData = store({
    activeTripId: 't1',
    trips: [trip('t1')],
    sightings: [sighting('s1'), sighting('s2', '2026-11-21T11:00:00.000-07:00')],
  });

  it('imports the old data once and keeps the original as a backup', async () => {
    const { repo, legacy } = setup();
    const raw = JSON.stringify(legacyData);
    legacy.setItem(STORAGE_KEY, raw);

    expect(await repo().load()).toEqual(legacyData);
    expect(legacy.getItem(STORAGE_KEY)).toBeNull();
    expect(legacy.getItem(LEGACY_BACKUP_KEY)).toBe(raw);

    // A later launch reads IndexedDB and does not look at the old key again.
    legacy.setItem(STORAGE_KEY, JSON.stringify(emptyStoreData()));
    expect(await repo().load()).toEqual(legacyData);
  });

  it('does not touch the old data if the import cannot be written', async () => {
    const legacy = new FakeStorage();
    legacy.setItem(STORAGE_KEY, JSON.stringify(legacyData));
    const broken = new IndexedDbRepository(() => Promise.reject(new Error('no db')), legacy);
    await expect(broken.load()).rejects.toThrow('no db');
    expect(legacy.getItem(STORAGE_KEY)).not.toBeNull();
    expect(legacy.getItem(LEGACY_BACKUP_KEY)).toBeNull();
  });

  it('parks unreadable old data instead of discarding it', async () => {
    const { repo, legacy } = setup();
    legacy.setItem(STORAGE_KEY, '{not json');
    expect(await repo().load()).toEqual(emptyStoreData());
    const parked = [...legacy.items.entries()].filter(([key]) => key.includes(':unreadable:'));
    expect(parked).toHaveLength(1);
    expect(parked[0]?.[1]).toBe('{not json');
  });
});

const photo = (id: string, overrides: Partial<Photo> = {}): Photo => ({
  id,
  sightingId: 's1',
  tripId: 't1',
  width: 800,
  height: 600,
  bytes: 3,
  createdAt: time,
  updatedAt: time,
  deletedAt: null,
  ...overrides,
});
const blobs = () => ({ full: new Blob(['full']), thumb: new Blob(['thumb']) });

describe('IndexedDbPhotoRepository', () => {
  it('stores metadata and image data, and drops the image data when retired', async () => {
    const { getDb } = setup();
    const repo = new IndexedDbPhotoRepository(getDb);
    await repo.save([{ photo: photo('p1'), blobs: blobs() }]);

    expect(await repo.loadAll()).toEqual([photo('p1')]);
    const stored = await repo.getBlobs('p1');
    expect(await stored?.full.text()).toBe('full');
    expect(await stored?.thumb.text()).toBe('thumb');

    const gone = photo('p1', { deletedAt: time, updatedAt: '2026-11-21T12:00:00.000-07:00' });
    await repo.retire([gone]);
    expect(await repo.loadAll()).toEqual([gone]);
    expect(await repo.getBlobs('p1')).toBeUndefined();
  });
});
