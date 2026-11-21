import { useSyncExternalStore } from 'react';
import { appStore, locationService, settings } from './instances';

export function useSettings() {
  return useSyncExternalStore(settings.subscribe, settings.getSnapshot);
}

export function useAppState() {
  return useSyncExternalStore(appStore.subscribe, appStore.getSnapshot);
}

export function useLocationState() {
  return useSyncExternalStore(locationService.subscribe, locationService.getSnapshot);
}
