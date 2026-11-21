import { appStore, locationService } from '../state/instances';

export function defaultTripName(): string {
  const month = new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return `Road trip, ${month}`;
}

/**
 * Starts a trip and turns on location. Call from a user gesture so the
 * browser's permission prompt appears now, not mid-spotting.
 */
export function startTrip(name: string) {
  locationService.enable();
  return appStore.createTrip(name);
}
