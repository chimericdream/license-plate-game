import type { StoreData } from '../domain/types';

/**
 * Everything the app persists goes through this interface, so the backing
 * store (localStorage today; IndexedDB or an API later) can be swapped
 * without touching the UI.
 */
export interface Repository {
  load(): Promise<StoreData>;
  save(data: StoreData): Promise<void>;
}
