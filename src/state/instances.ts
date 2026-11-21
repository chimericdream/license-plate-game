import { LocationService } from '../location/locationService';
import { PlaceResolver } from '../location/placeResolver';
import { reverseGeocode } from '../location/reverseGeocode';
import { IndexedDbRepository } from '../storage/indexedDbRepository';
import { IndexedDbPhotoRepository } from '../storage/photoRepository';
import { AppStore } from './appStore';
import { PhotoStore } from './photoStore';
import { SettingsStore } from './settings';

export const appStore = new AppStore(new IndexedDbRepository());
export const photoStore = new PhotoStore(new IndexedDbPhotoRepository(), appStore);
export const locationService = new LocationService();
export const settings = new SettingsStore(localStorage);

export const placeResolver = new PlaceResolver(appStore, settings, {
  geocode: (lat, lng) => reverseGeocode(lat, lng),
  delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  isOnline: () => navigator.onLine,
});
