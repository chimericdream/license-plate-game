import { describe, expect, it } from 'vitest';
import type { Photo, Sighting, StoreData, Trip } from '../domain/types';
import { createBackup } from './backup';
import { createBackupZip, parseBackupFile } from './backupZip';
import { emptyStoreData } from './migrate';
import { createZip } from './zip';

const time = '2026-11-21T10:00:00.000-07:00';
const now = new Date('2026-11-21T20:00:00.000Z');

const trip: Trip = {
  id: 't1',
  name: 'Trip',
  startedAt: time,
  endedAt: null,
  createdAt: time,
  updatedAt: time,
  deletedAt: null,
};
const sighting: Sighting = {
  id: 's1',
  tripId: 't1',
  regionId: 'US-CO',
  seenAt: time,
  location: null,
  note: '',
  createdAt: time,
  updatedAt: time,
  deletedAt: null,
};
const data: StoreData = {
  ...emptyStoreData(),
  activeTripId: 't1',
  trips: [trip],
  sightings: [sighting],
};
const photo = (id: string, overrides: Partial<Photo> = {}): Photo => ({
  id,
  sightingId: 's1',
  tripId: 't1',
  width: 10,
  height: 5,
  bytes: 4,
  createdAt: time,
  updatedAt: time,
  deletedAt: null,
  ...overrides,
});
const blobsFor = async (id: string) => ({
  full: new Blob([`full-${id}`]),
  thumb: new Blob([`thumb-${id}`]),
});

describe('backup zip', () => {
  it('round-trips data and photos', async () => {
    const zip = await createBackupZip(data, [photo('p1'), photo('p2')], blobsFor, now);
    const parsed = await parseBackupFile(zip);
    expect(parsed.data).toEqual(data);
    expect(parsed.photos.map((p) => p.photo.id)).toEqual(['p1', 'p2']);
    const blobs = await parsed.photos[1]!.blobs();
    expect(await blobs.full.text()).toBe('full-p2');
    expect(await blobs.thumb.text()).toBe('thumb-p2');
  });

  it('leaves out deleted photos and photos with no image data', async () => {
    const zip = await createBackupZip(
      data,
      [photo('p1', { deletedAt: time }), photo('p2'), photo('lost')],
      async (id) => (id === 'lost' ? undefined : blobsFor(id)),
      now,
    );
    const parsed = await parseBackupFile(zip);
    expect(parsed.photos.map((p) => p.photo.id)).toEqual(['p2']);
  });

  it('works with no photos at all', async () => {
    const parsed = await parseBackupFile(await createBackupZip(data, [], blobsFor, now));
    expect(parsed.photos).toEqual([]);
    expect(parsed.data).toEqual(data);
  });

  it('still reads a plain JSON backup', async () => {
    const parsed = await parseBackupFile(new Blob([createBackup(data, now)]));
    expect(parsed).toMatchObject({ data, photos: [] });
  });

  it('rejects a zip that is not a backup', async () => {
    const zip = await createZip([{ name: 'readme.txt', data: new Blob(['hi']) }]);
    await expect(parseBackupFile(zip)).rejects.toThrow(/not a Plate Trip backup/);
  });

  it('rejects a backup whose photo list names a missing image', async () => {
    const manifest = JSON.stringify({
      format: 'plate-trip-photos',
      formatVersion: 1,
      photos: [photo('p1')],
    });
    const zip = await createZip([
      { name: 'backup.json', data: new Blob([createBackup(data, now)]) },
      { name: 'photos.json', data: new Blob([manifest]) },
    ]);
    await expect(parseBackupFile(zip)).rejects.toThrow(/1 photo\(s\)/);
  });

  it('rejects photo ids that could not be file names', async () => {
    const manifest = JSON.stringify({
      format: 'plate-trip-photos',
      formatVersion: 1,
      photos: [photo('../evil')],
    });
    const zip = await createZip([
      { name: 'backup.json', data: new Blob([createBackup(data, now)]) },
      { name: 'photos.json', data: new Blob([manifest]) },
    ]);
    await expect(parseBackupFile(zip)).rejects.toThrow(/damaged/);
  });
});
