import { describe, expect, it } from 'vitest';
import type { Sighting, StoreData, Trip } from '../domain/types';
import { backupFilename, countLive, createBackup, mergeStoreData, parseBackup } from './backup';
import { emptyStoreData } from './migrate';

const T0 = '2026-11-21T12:00:00.000Z';
const T1 = '2026-11-21T13:00:00.000Z';
const T2 = '2026-11-21T14:00:00.000Z';

const trip = (id: string, overrides: Partial<Trip> = {}): Trip => ({
  id,
  name: id,
  startedAt: T0,
  endedAt: null,
  createdAt: T0,
  updatedAt: T0,
  deletedAt: null,
  ...overrides,
});

const sighting = (id: string, tripId: string, overrides: Partial<Sighting> = {}): Sighting => ({
  id,
  tripId,
  regionId: 'US-CO',
  seenAt: T0,
  location: { lat: 39.7, lng: -105, accuracy: 10, capturedAt: T0 },
  note: '',
  createdAt: T0,
  updatedAt: T0,
  deletedAt: null,
  ...overrides,
});

const data = (parts: Partial<StoreData>): StoreData => ({ ...emptyStoreData(), ...parts });

describe('createBackup / parseBackup', () => {
  it('round-trips the whole store', () => {
    const original = data({
      activeTripId: 't1',
      trips: [trip('t1')],
      sightings: [sighting('s1', 't1'), sighting('s2', 't1', { location: null })],
    });
    const text = createBackup(original, new Date(T0));
    expect(JSON.parse(text)).toMatchObject({ format: 'plate-trip-backup', exportedAt: T0 });
    expect(parseBackup(text)).toEqual(original);
  });

  it('also accepts a bare copy of the store', () => {
    const original = data({ trips: [trip('t1')] });
    expect(parseBackup(JSON.stringify(original))).toEqual(original);
  });

  it('rejects things that are not backups', () => {
    expect(() => parseBackup('not json')).toThrow(/valid JSON/);
    expect(() => parseBackup('[]')).toThrow(/not a Plate Trip backup/);
    expect(() => parseBackup(JSON.stringify({ format: 'something-else', data: {} }))).toThrow(
      /not a Plate Trip backup/,
    );
  });

  it('rejects data from a newer app version', () => {
    const newer = { ...emptyStoreData(), schemaVersion: 999 };
    expect(() => parseBackup(JSON.stringify(newer))).toThrow(/newer version/);
  });

  it('rejects a backup with malformed records instead of importing part of it', () => {
    const bad = data({
      trips: [trip('t1'), { id: 't2' } as unknown as Trip],
      sightings: [sighting('s1', 't1', { location: { lat: 999 } as never })],
    });
    expect(() => parseBackup(createBackup(bad, new Date(T0)))).toThrow(
      /1 trip\(s\) and 1 plate\(s\)/,
    );
  });
});

describe('mergeStoreData', () => {
  it('adds records that are new', () => {
    const { data: merged, stats } = mergeStoreData(
      data({ trips: [trip('a')], sightings: [sighting('s1', 'a')] }),
      data({ trips: [trip('b')], sightings: [sighting('s2', 'b')] }),
    );
    expect(merged.trips.map((t) => t.id)).toEqual(['a', 'b']);
    expect(merged.sightings.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(stats).toEqual({
      tripsAdded: 1,
      tripsUpdated: 0,
      sightingsAdded: 1,
      sightingsUpdated: 0,
    });
  });

  it('keeps the more recently updated copy of a record', () => {
    const current = data({
      sightings: [
        sighting('s1', 'a', { note: 'mine', updatedAt: T2 }),
        sighting('s2', 'a', { note: 'old' }),
      ],
    });
    const incoming = data({
      sightings: [
        sighting('s1', 'a', { note: 'theirs', updatedAt: T1 }),
        sighting('s2', 'a', { note: 'new', updatedAt: T1 }),
      ],
    });
    const { data: merged, stats } = mergeStoreData(current, incoming);
    expect(merged.sightings.find((s) => s.id === 's1')?.note).toBe('mine');
    expect(merged.sightings.find((s) => s.id === 's2')?.note).toBe('new');
    expect(stats.sightingsUpdated).toBe(1);
  });

  it('carries over a later deletion', () => {
    const { data: merged } = mergeStoreData(
      data({ sightings: [sighting('s1', 'a')] }),
      data({ sightings: [sighting('s1', 'a', { deletedAt: T1, updatedAt: T1 })] }),
    );
    expect(merged.sightings[0]?.deletedAt).toBe(T1);
  });

  it('is idempotent', () => {
    const base = data({ trips: [trip('a')], sightings: [sighting('s1', 'a')] });
    const once = mergeStoreData(base, base);
    expect(once.data).toEqual(base);
    expect(once.stats).toEqual({
      tripsAdded: 0,
      tripsUpdated: 0,
      sightingsAdded: 0,
      sightingsUpdated: 0,
    });
  });

  it('keeps the current active trip, else adopts the incoming open one', () => {
    const current = data({ activeTripId: 'a', trips: [trip('a')] });
    const incoming = data({ activeTripId: 'b', trips: [trip('b')] });
    expect(mergeStoreData(current, incoming).data.activeTripId).toBe('a');

    const empty = data({});
    expect(mergeStoreData(empty, incoming).data.activeTripId).toBe('b');

    const ended = data({ activeTripId: 'b', trips: [trip('b', { endedAt: T1 })] });
    expect(mergeStoreData(empty, ended).data.activeTripId).toBeNull();
  });
});

describe('helpers', () => {
  it('counts only live records', () => {
    expect(
      countLive(
        data({
          trips: [trip('a'), trip('b', { deletedAt: T1 })],
          sightings: [sighting('s1', 'a'), sighting('s2', 'a', { deletedAt: T1 })],
        }),
      ),
    ).toEqual({ trips: 1, sightings: 1 });
  });

  it('names backups by local date', () => {
    expect(backupFilename(new Date(2026, 10, 5))).toBe('plate-trip-backup-2026-11-05.json');
  });
});
