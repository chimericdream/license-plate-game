import type { AppStore } from '../state/appStore';
import type { SettingsStore } from '../state/settings';

export interface ResolverDeps {
  geocode: (lat: number, lng: number) => Promise<string | null>;
  delay: (ms: number) => Promise<void>;
  isOnline: () => boolean;
  /** Nominatim asks for no more than one request per second. */
  spacingMs?: number;
  /** How long to leave the service alone after a failure. */
  backoffMs?: number;
  now?: () => number;
}

/**
 * Quietly fills in town names for located plates, one request at a time, only
 * when the user has switched lookups on and the device is online.
 */
export class PlaceResolver {
  private running = false;
  private rerun = false;
  private blockedUntil = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly store: AppStore,
    private readonly settings: SettingsStore,
    private readonly deps: ResolverDeps,
  ) {}

  /** Begins reacting to data and setting changes; returns a function that stops. */
  start(): () => void {
    const trigger = () => void this.run();
    const offStore = this.store.subscribe(trigger);
    const offSettings = this.settings.subscribe(trigger);
    if (typeof window !== 'undefined') window.addEventListener('online', trigger);
    trigger();
    return () => {
      offStore();
      offSettings();
      if (typeof window !== 'undefined') window.removeEventListener('online', trigger);
      clearTimeout(this.retryTimer);
    };
  }

  /** Resolves when no more work is pending (exposed so tests can wait). */
  async run(): Promise<void> {
    if (this.running) {
      this.rerun = true;
      return;
    }
    this.running = true;
    try {
      do {
        this.rerun = false;
        await this.drain();
      } while (this.rerun);
    } finally {
      this.running = false;
    }
  }

  private async drain(): Promise<void> {
    const now = this.deps.now ?? Date.now;
    for (;;) {
      if (!this.settings.getSnapshot().lookUpPlaces || !this.deps.isOnline()) return;
      if (now() < this.blockedUntil) return;

      const { data } = this.store.getSnapshot();
      const next = data.sightings.find((s) => !s.deletedAt && s.location && s.place === undefined);
      if (!next?.location) return;

      try {
        const place = await this.deps.geocode(next.location.lat, next.location.lng);
        this.store.setPlace(next.id, place);
      } catch {
        const backoff = this.deps.backoffMs ?? 60_000;
        this.blockedUntil = now() + backoff;
        clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => void this.run(), backoff);
        return;
      }
      await this.deps.delay(this.deps.spacingMs ?? 1100);
    }
  }
}
