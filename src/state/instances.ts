import { LocationService } from '../location/locationService';
import { LocalStorageRepository } from '../storage/localStorageRepository';
import { AppStore } from './appStore';

export const appStore = new AppStore(new LocalStorageRepository());
export const locationService = new LocationService();
