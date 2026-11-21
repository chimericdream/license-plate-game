import { useSyncExternalStore } from 'react';
import { appStore, locationService } from './instances';

export function useAppState() {
  return useSyncExternalStore(appStore.subscribe, appStore.getSnapshot);
}

export function useLocationState() {
  return useSyncExternalStore(locationService.subscribe, locationService.getSnapshot);
}
