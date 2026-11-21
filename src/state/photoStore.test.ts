import { describe, expect, it } from 'vitest';
import type { Photo, Sighting, StoreData } from '../domain/types';
import { fitWithin } from '../photos/processImage';
import { emptyStoreData } from '../storage/migrate';
import type { PhotoBlobs, PhotoRepository } from '../storage/photoRepository';
import type { AppState } from './appStore';
import { PhotoStore, type DataSource } from './photoStore';

class MemoryPhotoRepository implements PhotoRepository {
  meta = new Map<string, Photo>();
  blobs = new Map<string, PhotoBlobs>();
  failSaves = false;
  async loadAll() {
    return [...this.meta.values()];
  }
  async save(items: { photo: Photo; blobs: PhotoBlobs }[]) {
    if (this.failSaves) throw new Error('disk full');
    for (const { photo, blobs } of items) {
      this.meta.set(photo.id, photo);
      this.blobs.set(photo.id, blobs);
    }
  }
  async retire(photos: Photo[]) {
    for (const photo of photos) {
      this.meta.set(photo.id, photo);
      this.blobs.delete(photo.id);
    }
  }
  async getBlobs(id: string) {
    return this.blobs.get(id);
  }
}

class FakeSource implements DataSource {
  state: AppState = { status: 'ready', data: emptyStoreData(), error: null };
  listeners = new Set<() => void>();
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  set(next: Partial<AppState>) {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener();
  }
  setData(data: StoreData) {
    this.set({ data });
  }
}

const time = '2026-11-21T10:00:00.000-07:00';

function sighting(id: string, overrides: Partial<Sighting> = {}): Sighting {
  return {
    id,
    tripId: 't1',
    regionId: 'US-CO',
    seenAt: time,
    location: null,
    note: '',
    createdAt: time,
    updatedAt: time,
    deletedAt: null,
    ...overrides,
  };
}

const dataWith = (...sightings: Sighting[]): StoreData => ({ ...emptyStoreData(), sightings });

const photo = (id: string, sightingId = 's1', overrides: Partial<Photo> = {}): Photo => ({
  id,
  sightingId,
  tripId: 't1',
  width: 100,
  height: 50,
  bytes: 4,
  createdAt: time,
  updatedAt: time,
  deletedAt: null,
  ...overrides,
});

const file = (name = 'x.jpg') => new File(['raw'], name, { type: 'image/jpeg' });

async function setup(data = dataWith(sighting('s1'))) {
  const repo = new MemoryPhotoRepository();
  const source = new FakeSource();
  source.setData(data);
  let n = 0;
  const store = new PhotoStore(repo, source, {
    now: () => new Date('2026-11-21T17:00:00.000Z'),
    uuid: () => `p${++n}`,
    process: async (input) => {
      if (input instanceof File && input.name === 'bad.txt') throw new Error('not an image');
      return { full: new Blob(['full']), thumb: new Blob(['th']), width: 200, height: 100 };
    },
  });
  await store.init();
  return { repo, source, store };
}

const live = (store: PhotoStore) => store.getSnapshot().photos.filter((p) => !p.deletedAt);

describe('PhotoStore', () => {
  it('adds photos to a sighting and stores both renditions', async () => {
    const { repo, store } = await setup();
    const result = await store.add({ id: 's1', tripId: 't1' }, [file(), file()]);
    expect(result).toEqual({ added: 2, failures: [] });
    expect(live(store).map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(live(store)[0]).toMatchObject({ sightingId: 's1', tripId: 't1', width: 200, bytes: 4 });
    expect(await (await store.getBlob('p1', 'thumb'))?.text()).toBe('th');
    expect(repo.blobs.size).toBe(2);
  });

  it('reports files that fail without losing the others', async () => {
    const { store } = await setup();
    const result = await store.add({ id: 's1', tripId: 't1' }, [file('bad.txt'), file()]);
    expect(result.added).toBe(1);
    expect(result.failures).toEqual(['not an image']);
  });

  it('reports a failed write', async () => {
    const { repo, store } = await setup();
    repo.failSaves = true;
    const result = await store.add({ id: 's1', tripId: 't1' }, [file()]);
    expect(result).toEqual({ added: 0, failures: ['disk full'] });
    expect(live(store)).toHaveLength(0);
  });

  it('removes a photo and discards its image data', async () => {
    const { repo, store } = await setup();
    await store.add({ id: 's1', tripId: 't1' }, [file(), file()]);
    await store.remove('p1');
    expect(live(store).map((p) => p.id)).toEqual(['p2']);
    expect(repo.blobs.has('p1')).toBe(false);
    expect(repo.meta.get('p1')?.deletedAt).not.toBeNull();
  });

  it('discards photos when their plate is deleted', async () => {
    const { repo, source, store } = await setup(dataWith(sighting('s1'), sighting('s2')));
    await store.add({ id: 's1', tripId: 't1' }, [file()]);
    await store.add({ id: 's2', tripId: 't1' }, [file()]);

    source.setData(dataWith(sighting('s1', { deletedAt: time }), sighting('s2')));
    await store.remove('nothing'); // waits for the queue to drain

    expect(live(store).map((p) => p.sightingId)).toEqual(['s2']);
    expect(repo.blobs.size).toBe(1);
  });

  it('discards photos whose plate vanished entirely (e.g. a replaced import)', async () => {
    const { source, store } = await setup();
    await store.add({ id: 's1', tripId: 't1' }, [file()]);
    source.setData(dataWith());
    await store.remove('nothing');
    expect(live(store)).toHaveLength(0);
  });

  it('never deletes anything before the plates have loaded', async () => {
    const repo = new MemoryPhotoRepository();
    repo.meta.set('p9', photo('p9'));
    const source = new FakeSource();
    source.set({ status: 'loading', data: emptyStoreData() });
    const store = new PhotoStore(repo, source);
    await store.init();
    await store.remove('nothing');
    expect(live(store)).toHaveLength(1);

    source.set({ status: 'error' });
    await store.remove('nothing');
    expect(live(store)).toHaveLength(1);
  });

  it('refuses to add before it has loaded', async () => {
    const store = new PhotoStore(new MemoryPhotoRepository(), new FakeSource());
    const result = await store.add({ id: 's1', tripId: 't1' }, [file()]);
    expect(result.added).toBe(0);
    expect(result.failures).toHaveLength(1);
  });
});

const item = (p: Photo) => ({
  photo: p,
  blobs: async () => ({ full: new Blob([p.id]), thumb: new Blob([p.id]) }),
});

describe('PhotoStore.importPhotos', () => {
  const liveIds = new Set(['s1']);

  it('merge adds missing photos and leaves existing ones alone', async () => {
    const { repo, store } = await setup();
    await store.add({ id: 's1', tripId: 't1' }, [file()]); // p1
    const result = await store.importPhotos(
      [item(photo('p1')), item(photo('p7')), item(photo('p8', 'gone'))],
      'merge',
      liveIds,
    );
    expect(result.added).toBe(1);
    expect(live(store).map((p) => p.id)).toEqual(['p1', 'p7']);
    expect(await (await repo.getBlobs('p7'))?.full.text()).toBe('p7');
  });

  it('merge restores a deleted photo only if the backup is newer', async () => {
    const { store } = await setup();
    await store.add({ id: 's1', tripId: 't1' }, [file()]); // p1
    await store.remove('p1');

    await store.importPhotos([item(photo('p1', 's1', { updatedAt: time }))], 'merge', liveIds);
    expect(live(store)).toHaveLength(0);

    await store.importPhotos(
      [item(photo('p1', 's1', { updatedAt: '2099-01-01T00:00:00.000Z' }))],
      'merge',
      liveIds,
    );
    expect(live(store).map((p) => p.id)).toEqual(['p1']);
  });

  it('replace keeps only the backup photos', async () => {
    const { repo, store } = await setup();
    await store.add({ id: 's1', tripId: 't1' }, [file(), file()]); // p1, p2
    await store.importPhotos([item(photo('p2')), item(photo('p5'))], 'replace', liveIds);
    expect(live(store).map((p) => p.id)).toEqual(['p2', 'p5']);
    expect(repo.blobs.has('p1')).toBe(false);
    expect(repo.blobs.has('p5')).toBe(true);
  });

  it('skips deleted photos in the backup', async () => {
    const { store } = await setup();
    const result = await store.importPhotos(
      [item(photo('p3', 's1', { deletedAt: time }))],
      'merge',
      liveIds,
    );
    expect(result.added).toBe(0);
  });
});

describe('fitWithin', () => {
  it('scales the long edge down to the limit and keeps the aspect ratio', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it('never scales up and never returns zero', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(10000, 1, 100)).toEqual({ width: 100, height: 1 });
  });
});
