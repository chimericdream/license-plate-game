import { isoWithOffset } from '../domain/time';
import type { Photo, StoreData } from '../domain/types';
import { processImage, type ImageProcessor } from '../photos/processImage';
import type { PhotoBlobs, PhotoRepository } from '../storage/photoRepository';
import type { AppState } from './appStore';

export interface PhotoState {
  status: 'loading' | 'ready' | 'error';
  /** Metadata for every photo, including deleted ones (kept so a future sync can see them). */
  photos: Photo[];
  error: string | null;
}

/** Where the store learns which plates exist; satisfied by AppStore. */
export interface DataSource {
  getSnapshot(): AppState;
  subscribe(listener: () => void): () => void;
}

export interface PhotoDeps {
  now: () => Date;
  uuid: () => string;
  process: ImageProcessor;
}

const defaultDeps: PhotoDeps = {
  now: () => new Date(),
  uuid: () => crypto.randomUUID(),
  process: processImage,
};

export interface AddResult {
  added: number;
  /** One readable message per file that could not be added. */
  failures: string[];
}

export interface ImportItem {
  photo: Photo;
  /** Loaded only when the photo is actually kept. */
  blobs: () => Promise<PhotoBlobs>;
}

type Listener = () => void;

const isLive = (photo: Photo) => !photo.deletedAt;

function describe(error: unknown): string {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return 'There is not enough storage space left on this device.';
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Photos attached to sightings. Metadata is kept in memory (and in the
 * repository); image data is read from the repository only when shown.
 * A photo lives only as long as its sighting does.
 */
export class PhotoStore {
  private state: PhotoState = { status: 'loading', photos: [], error: null };
  private listeners = new Set<Listener>();
  private initPromise: Promise<void> | null = null;
  /** Serialises writes so edits, imports and clean-ups can't interleave. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly repo: PhotoRepository,
    private readonly source: DataSource,
    private readonly deps: PhotoDeps = defaultDeps,
  ) {}

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): PhotoState => this.state;

  init(): Promise<void> {
    this.initPromise ??= this.repo
      .loadAll()
      .then((photos) => {
        this.set({ status: 'ready', photos, error: null });
        this.source.subscribe(() => this.reconcile());
        this.reconcile();
      })
      .catch((error: unknown) =>
        this.set({ ...this.state, status: 'error', error: describe(error) }),
      );
    return this.initPromise;
  }

  /** Reads, shrinks and stores each file as a photo of the sighting. */
  async add(sighting: { id: string; tripId: string }, files: readonly File[]): Promise<AddResult> {
    const result: AddResult = { added: 0, failures: [] };
    if (this.state.status !== 'ready') {
      return { added: 0, failures: ['Photos are not available right now.'] };
    }
    for (const file of files) {
      try {
        // Decoding is slow and needs no lock; only the write is queued.
        const processed = await this.deps.process(file);
        const now = isoWithOffset(this.deps.now());
        const photo: Photo = {
          id: this.deps.uuid(),
          sightingId: sighting.id,
          tripId: sighting.tripId,
          width: processed.width,
          height: processed.height,
          bytes: processed.full.size,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
        await this.enqueue(async () => {
          await this.repo.save([
            { photo, blobs: { full: processed.full, thumb: processed.thumb } },
          ]);
          this.set({ ...this.state, photos: [...this.state.photos, photo] });
        });
        result.added += 1;
      } catch (error) {
        result.failures.push(describe(error));
      }
    }
    // The plate may have been removed while the photo was being processed.
    this.reconcile();
    return result;
  }

  remove(id: string): Promise<void> {
    return this.retire((photo) => photo.id === id);
  }

  async getBlob(id: string, kind: 'full' | 'thumb'): Promise<Blob | undefined> {
    return (await this.repo.getBlobs(id))?.[kind];
  }

  getBlobs(id: string): Promise<PhotoBlobs | undefined> {
    return this.repo.getBlobs(id);
  }

  /**
   * Brings photos in from a backup. "merge" keeps what's here and adds or
   * restores photos the backup has newer information about; "replace" makes
   * the backup's photos the only ones. Photos whose plate is not live are skipped.
   */
  importPhotos(
    items: readonly ImportItem[],
    mode: 'merge' | 'replace',
    liveIds: ReadonlySet<string>,
  ): Promise<{ added: number }> {
    return this.enqueue(async () => {
      const current = new Map(this.state.photos.map((p) => [p.id, p]));
      const toSave: { photo: Photo; blobs: PhotoBlobs }[] = [];
      const keep = new Set<string>();

      for (const item of items) {
        const { photo } = item;
        if (!isLive(photo) || !liveIds.has(photo.sightingId)) continue;
        keep.add(photo.id);
        const existing = current.get(photo.id);
        if (existing && isLive(existing)) continue; // already here
        const take =
          mode === 'replace' ||
          !existing ||
          Date.parse(photo.updatedAt) > Date.parse(existing.updatedAt);
        if (take) toSave.push({ photo, blobs: await item.blobs() });
      }
      await this.repo.save(toSave);

      const retired: Photo[] = [];
      if (mode === 'replace') {
        const now = isoWithOffset(this.deps.now());
        for (const photo of this.state.photos) {
          if (isLive(photo) && !keep.has(photo.id)) {
            retired.push({ ...photo, deletedAt: now, updatedAt: now });
          }
        }
        await this.repo.retire(retired);
      }

      const byId = new Map(this.state.photos.map((p) => [p.id, p]));
      for (const { photo } of toSave) byId.set(photo.id, photo);
      for (const photo of retired) byId.set(photo.id, photo);
      this.set({ ...this.state, photos: [...byId.values()] });
      return { added: toSave.length };
    });
  }

  /**
   * Discards photos whose plate no longer exists or was deleted (a removed
   * trip, an undone plate, a replaced import, ...). Does nothing until the
   * plates themselves have loaded, so an empty start-up state can't delete anything.
   */
  reconcile(): void {
    const app = this.source.getSnapshot();
    if (app.status !== 'ready' || this.state.status !== 'ready') return;
    const live = liveSightingIds(app.data);
    this.retire((photo) => !live.has(photo.sightingId)).catch((error: unknown) =>
      this.set({ ...this.state, error: `Could not clean up photos: ${describe(error)}` }),
    );
  }

  private retire(matches: (photo: Photo) => boolean): Promise<void> {
    return this.enqueue(async () => {
      const targets = this.state.photos.filter((p) => isLive(p) && matches(p));
      if (targets.length === 0) return;
      const now = isoWithOffset(this.deps.now());
      const retired = targets.map((p) => ({ ...p, deletedAt: now, updatedAt: now }));
      await this.repo.retire(retired);
      const byId = new Map(retired.map((p) => [p.id, p]));
      this.set({ ...this.state, photos: this.state.photos.map((p) => byId.get(p.id) ?? p) });
    });
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task, task);
    // Each caller handles its own failure; the queue just keeps going.
    this.queue = next.catch(() => undefined);
    return next;
  }

  private set(next: PhotoState): void {
    this.state = next;
    for (const listener of this.listeners) listener();
  }
}

export function liveSightingIds(data: StoreData): Set<string> {
  return new Set(data.sightings.filter((s) => !s.deletedAt).map((s) => s.id));
}
