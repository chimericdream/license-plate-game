import { describe, expect, it } from 'vitest';
import type { GeoFix, StoreData } from '../domain/types';
import { emptyStoreData } from '../storage/migrate';
import type { Repository } from '../storage/repository';
import { AppStore } from './appStore';
import { countByRegion, selectActiveTrip, selectTripSightings } from './selectors';

class MemoryRepository implements Repository {
  saved: StoreData | null = null;
  async load() {
    return this.saved ?? emptyStoreData();
  }
  async save(data: StoreData) {
    this.saved = data;
  }
}

function setup() {
  const repo = new MemoryRepository();
  let clock = new Date('2026-11-21T12:00:00.000Z');
  let n = 0;
  const store = new AppStore(repo, { now: () => clock, uuid: () => `id-${++n}` });
  return {
    repo,
    store,
    advance: (minutes: number) => {
      clock = new Date(clock.getTime() + minutes * 60_000);
    },
  };
}

const fix = (lat: number, lng: number): GeoFix => ({
  lat,
  lng,
  accuracy: 10,
  capturedAt: '2026-11-21T12:00:00.000Z',
});

describe('AppStore', () => {
  it('loads once and becomes ready', async () => {
    const { store } = setup();
    expect(store.getSnapshot().status).toBe('loading');
    await Promise.all([store.init(), store.init()]);
    expect(store.getSnapshot().status).toBe('ready');
  });

  it('creates a trip, makes it active and ends the previous one', async () => {
    const { store, advance } = setup();
    await store.init();
    const first = store.createTrip('  Colorado  ');
    expect(first.name).toBe('Colorado');
    advance(60);
    const second = store.createTrip('');
    expect(second.name).toBe('Road trip');

    const data = store.getSnapshot().data;
    expect(selectActiveTrip(data)?.id).toBe(second.id);
    expect(data.trips.find((t) => t.id === first.id)?.endedAt).not.toBeNull();
  });

  it('refuses to log without an active trip', async () => {
    const { store } = setup();
    await store.init();
    expect(store.logSighting({ regionId: 'US-CO', fix: null })).toEqual({
      ok: false,
      reason: 'no-active-trip',
    });
  });

  it('logs a sighting and persists it', async () => {
    const { store, repo } = setup();
    await store.init();
    store.createTrip('Trip');
    const result = store.logSighting({ regionId: 'US-CO', fix: fix(39.7, -105) });
    expect(result.ok).toBe(true);
    await Promise.resolve();
    expect(repo.saved?.sightings).toHaveLength(1);
  });

  it('applies the cooldown, and lets force override it', async () => {
    const { store, advance } = setup();
    await store.init();
    store.createTrip('Trip');
    const here = fix(39.7, -105);
    expect(store.logSighting({ regionId: 'US-CO', fix: here }).ok).toBe(true);

    advance(5);
    const blocked = store.logSighting({ regionId: 'US-CO', fix: here });
    expect(blocked).toMatchObject({ ok: false, reason: 'cooldown' });

    // A different region is never affected.
    expect(store.logSighting({ regionId: 'US-UT', fix: here }).ok).toBe(true);

    expect(store.logSighting({ regionId: 'US-CO', fix: here, force: true }).ok).toBe(true);
    const sightings = selectTripSightings(
      store.getSnapshot().data,
      selectActiveTrip(store.getSnapshot().data)!.id,
    );
    expect(countByRegion(sightings).get('US-CO')).toBe(2);
  });

  it('allows a repeat after enough time and distance', async () => {
    const { store, advance } = setup();
    await store.init();
    store.createTrip('Trip');
    store.logSighting({ regionId: 'US-CO', fix: fix(39.7392, -104.9903) });
    advance(120);
    expect(store.logSighting({ regionId: 'US-CO', fix: fix(39.0639, -108.5506) }).ok).toBe(true);
  });

  it('undo soft-deletes, and a removed sighting no longer blocks or counts', async () => {
    const { store, advance } = setup();
    await store.init();
    store.createTrip('Trip');
    const result = store.logSighting({ regionId: 'US-CO', fix: null });
    if (!result.ok) throw new Error('expected ok');
    store.removeSighting(result.sighting.id);

    const data = store.getSnapshot().data;
    expect(data.sightings[0]?.deletedAt).not.toBeNull();
    advance(1);
    expect(store.logSighting({ regionId: 'US-CO', fix: null }).ok).toBe(true);
  });

  it('attaches a late location only once', async () => {
    const { store } = setup();
    await store.init();
    store.createTrip('Trip');
    const result = store.logSighting({ regionId: 'US-CO', fix: null });
    if (!result.ok) throw new Error('expected ok');

    store.attachLocation(result.sighting.id, fix(1, 2));
    store.attachLocation(result.sighting.id, fix(3, 4));
    expect(store.getSnapshot().data.sightings[0]?.location).toMatchObject({ lat: 1, lng: 2 });
  });

  it('notifies subscribers on change', async () => {
    const { store } = setup();
    await store.init();
    let calls = 0;
    const unsubscribe = store.subscribe(() => (calls += 1));
    store.createTrip('Trip');
    expect(calls).toBeGreaterThan(0);
    unsubscribe();
    const before = calls;
    store.createTrip('Another');
    expect(calls).toBe(before);
  });
});
