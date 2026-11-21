/**
 * Asks the browser not to evict our data when it is short on space. Chrome
 * decides silently (installed apps are usually granted); Firefox may prompt.
 * Resolves with the outcome, or null when the API is unavailable.
 */
export async function requestPersistentStorage(): Promise<boolean | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return null;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}
