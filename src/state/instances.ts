import { LocationService } from '../location/locationService';
import { PlaceResolver } from '../location/placeResolver';
import { reverseGeocode } from '../location/reverseGeocode';
import { LocalStorageRepository } from '../storage/localStorageRepository';
import { AppStore } from './appStore';
import { SettingsStore } from './settings';

export const appStore = new AppStore(new LocalStorageRepository());
export const locationService = new LocationService();
export const settings = new SettingsStore(localStorage);

export const placeResolver = new PlaceResolver(appStore, settings, {
  geocode: (lat, lng) => reverseGeocode(lat, lng),
  delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  isOnline: () => navigator.onLine,
});
