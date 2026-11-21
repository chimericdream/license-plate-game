import { describe, expect, it } from 'vitest';
import type { GeoFix, StoreData } from '../domain/types';
import { AppStore } from '../state/appStore';
import { SettingsStore } from '../state/settings';
import { emptyStoreData } from '../storage/migrate';
import type { Repository } from '../storage/repository';
import { PlaceResolver } from './placeResolver';

class MemoryRepository implements Repository {
  async load() {
    return emptyStoreData();
  }
  async save(_data: StoreData) {}
}

const memoryStorage = () => {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
};

const fix = (lat: number, lng: number): GeoFix => ({
  lat,
  lng,
  accuracy: 5,
  capturedAt: '2026-11-21T12:00:00.000Z',
});

async function setup(options: { enabled?: boolean; online?: boolean } = {}) {
  let clock = new Date('2026-11-21T12:00:00.000Z');
  let n = 0;
  const store = new AppStore(new MemoryRepository(), {
    now: () => clock,
    uuid: () => `id-${++n}`,
  });
  await store.init();
  store.createTrip('Trip');

  const settings = new SettingsStore(memoryStorage());
  settings.update({ lookUpPlaces: options.enabled ?? true });

  const calls: [number, number][] = [];
  let online = options.online ?? true;
  let failures = 0;
  let nowMs = 1_000_000;
  const resolver = new PlaceResolver(store, settings, {
    geocode: async (lat, lng) => {
      calls.push([lat, lng]);
      if (failures > 0) {
        failures -= 1;
        throw new Error('offline');
      }
      return lat === 0 ? null : `Town at ${lat}`;
    },
    delay: async () => {},
    isOnline: () => online,
    backoffMs: 60_000,
    now: () => nowMs,
  });

  const log = (regionId: string, location: GeoFix | null) => {
    clock = new Date(clock.getTime() + 60 * 60_000);
    const result = store.logSighting({ regionId, fix: location, force: true });
    if (!result.ok) throw new Error('expected ok');
    return result.sighting.id;
  };

  return {
    store,
    settings,
    resolver,
    calls,
    log,
    setOnline: (value: boolean) => (online = value),
    failNext: (count: number) => (failures = count),
    advance: (ms: number) => (nowMs += ms),
    places: () => store.getSnapshot().data.sightings.map((s) => s.place),
  };
}

describe('PlaceResolver', () => {
  it('fills in places for located sightings, one at a time', async () => {
    const t = await setup();
    t.log('US-CO', fix(39, -105));
    t.log('US-UT', fix(38, -109));
    await t.resolver.run();
    expect(t.calls).toEqual([
      [39, -105],
      [38, -109],
    ]);
    expect(t.places()).toEqual(['Town at 39', 'Town at 38']);
  });

  it('does nothing while the setting is off', async () => {
    const t = await setup({ enabled: false });
    t.log('US-CO', fix(39, -105));
    await t.resolver.run();
    expect(t.calls).toEqual([]);
    expect(t.places()).toEqual([undefined]);
  });

  it('does nothing while offline, then catches up', async () => {
    const t = await setup({ online: false });
    t.log('US-CO', fix(39, -105));
    await t.resolver.run();
    expect(t.calls).toEqual([]);
    t.setOnline(true);
    await t.resolver.run();
    expect(t.places()).toEqual(['Town at 39']);
  });

  it('skips unlocated and already-resolved sightings, and removed ones', async () => {
    const t = await setup();
    t.log('US-CO', null);
    const done = t.log('US-UT', fix(38, -109));
    t.store.setPlace(done, 'Already here');
    const removed = t.log('US-WY', fix(41, -105));
    t.store.removeSighting(removed);
    await t.resolver.run();
    expect(t.calls).toEqual([]);
  });

  it('records "nothing found" so it is not asked again', async () => {
    const t = await setup();
    t.log('US-CO', fix(0, 0));
    await t.resolver.run();
    await t.resolver.run();
    expect(t.calls).toHaveLength(1);
    expect(t.places()).toEqual([null]);
  });

  it('backs off after a failure and retries once the pause is over', async () => {
    const t = await setup();
    t.log('US-CO', fix(39, -105));
    t.failNext(1);
    await t.resolver.run();
    expect(t.calls).toHaveLength(1);
    expect(t.places()).toEqual([undefined]);

    await t.resolver.run(); // still inside the pause
    expect(t.calls).toHaveLength(1);

    t.advance(61_000);
    await t.resolver.run();
    expect(t.places()).toEqual(['Town at 39']);
  });

  it('picks up a sighting that is changed to have no place yet', async () => {
    const t = await setup();
    const id = t.log('US-CO', fix(39, -105));
    await t.resolver.run();
    t.store.updateSighting(id, { location: fix(38, -109), place: undefined });
    await t.resolver.run();
    expect(t.places()).toEqual(['Town at 38']);
  });
});
