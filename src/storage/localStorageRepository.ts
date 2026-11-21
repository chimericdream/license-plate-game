import type { StoreData } from '../domain/types';
import { emptyStoreData, migrate } from './migrate';
import type { Repository } from './repository';

export const STORAGE_KEY = 'plate-trip:data';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export class LocalStorageRepository implements Repository {
  constructor(
    private readonly storage: StorageLike = localStorage,
    private readonly key: string = STORAGE_KEY,
  ) {}

  async load(): Promise<StoreData> {
    const raw = this.storage.getItem(this.key);
    if (raw === null) return emptyStoreData();
    try {
      return migrate(JSON.parse(raw));
    } catch (error) {
      // Never silently destroy data we can't read: keep a copy before the
      // next save overwrites it, and start fresh.
      const backupKey = `${this.key}:unreadable:${Date.now()}`;
      try {
        this.storage.setItem(backupKey, raw);
      } catch {
        // Out of space; nothing more we can do.
      }
      console.warn(`Could not read stored data; backed up to ${backupKey}`, error);
      return emptyStoreData();
    }
  }

  async save(data: StoreData): Promise<void> {
    this.storage.setItem(this.key, JSON.stringify(data));
  }
}
