import { describe, expect, it } from 'vitest';
import { LocalStorageRepository } from './localStorageRepository';
import { SCHEMA_VERSION, emptyStoreData, migrate } from './migrate';

class FakeStorage {
  items = new Map<string, string>();
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
}

describe('migrate', () => {
  it('returns empty data for nothing stored', () => {
    expect(migrate(null)).toEqual(emptyStoreData());
  });

  it('accepts current-version data', () => {
    const data = { ...emptyStoreData(), activeTripId: 't1' };
    expect(migrate(data)).toEqual(data);
  });

  it('rejects data from a newer app version', () => {
    expect(() => migrate({ ...emptyStoreData(), schemaVersion: SCHEMA_VERSION + 1 })).toThrow(
      /newer version/,
    );
  });

  it('rejects malformed data', () => {
    expect(() => migrate('nope')).toThrow();
    expect(() => migrate({ schemaVersion: 1, trips: [] })).toThrow();
    expect(() => migrate({ trips: [], sightings: [] })).toThrow();
  });
});

describe('LocalStorageRepository', () => {
  it('round-trips data', async () => {
    const repo = new LocalStorageRepository(new FakeStorage());
    const data = { ...emptyStoreData(), activeTripId: 'abc' };
    await repo.save(data);
    expect(await repo.load()).toEqual(data);
  });

  it('starts empty when nothing is stored', async () => {
    const repo = new LocalStorageRepository(new FakeStorage());
    expect(await repo.load()).toEqual(emptyStoreData());
  });

  it('backs up unreadable data instead of discarding it', async () => {
    const storage = new FakeStorage();
    storage.setItem('plate-trip:data', '{not json');
    const repo = new LocalStorageRepository(storage);
    expect(await repo.load()).toEqual(emptyStoreData());
    const backups = [...storage.items.entries()].filter(([k]) => k.includes(':unreadable:'));
    expect(backups).toHaveLength(1);
    expect(backups[0]?.[1]).toBe('{not json');
  });
});
