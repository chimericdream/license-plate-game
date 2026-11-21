import type { Photo } from '../domain/types';
import { sharedDb, type PhotoBlobs, type PlateDb } from './db';

export type { PhotoBlobs };

export interface PhotoRepository {
  /** Metadata for every photo, including ones that were deleted. */
  loadAll(): Promise<Photo[]>;
  /** Writes photos with their image data, replacing any with the same id. */
  save(items: { photo: Photo; blobs: PhotoBlobs }[]): Promise<void>;
  /** Writes metadata for photos that were deleted and discards their image data. */
  retire(photos: Photo[]): Promise<void>;
  getBlobs(id: string): Promise<PhotoBlobs | undefined>;
}

export class IndexedDbPhotoRepository implements PhotoRepository {
  constructor(private readonly getDb: () => Promise<PlateDb> = sharedDb) {}

  async loadAll(): Promise<Photo[]> {
    return (await this.getDb()).getAll('photos');
  }

  async save(items: { photo: Photo; blobs: PhotoBlobs }[]): Promise<void> {
    if (items.length === 0) return;
    const db = await this.getDb();
    const tx = db.transaction(['photos', 'photoBlobs'], 'readwrite');
    for (const { photo, blobs } of items) {
      void tx.objectStore('photos').put(photo);
      void tx.objectStore('photoBlobs').put(blobs, photo.id);
    }
    await tx.done;
  }

  async retire(photos: Photo[]): Promise<void> {
    if (photos.length === 0) return;
    const db = await this.getDb();
    const tx = db.transaction(['photos', 'photoBlobs'], 'readwrite');
    for (const photo of photos) {
      void tx.objectStore('photos').put(photo);
      void tx.objectStore('photoBlobs').delete(photo.id);
    }
    await tx.done;
  }

  async getBlobs(id: string): Promise<PhotoBlobs | undefined> {
    return (await this.getDb()).get('photoBlobs', id);
  }
}
