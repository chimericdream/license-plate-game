import { isoWithOffset } from '../domain/time';
import type { GeoFix } from '../domain/types';

export type PermissionStatus = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unsupported';

export interface LocationState {
  permission: PermissionStatus;
  /** Most recent position seen while the app was open. */
  fix: GeoFix | null;
  watching: boolean;
}

/** A fix older than this is not used for a new sighting or the cooldown. */
export const FRESH_FIX_MS = 60_000;

const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 10_000,
  timeout: 30_000,
};

type Listener = () => void;

function toFix(position: GeolocationPosition): GeoFix {
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
    capturedAt: isoWithOffset(new Date(position.timestamp)),
  };
}

/**
 * Keeps a warm position while the app is in the foreground so tapping a plate
 * never waits on the GPS. The browser can't track in the background, so the
 * watch pauses when the page is hidden and resumes when it returns.
 */
export class LocationService {
  private state: LocationState = { permission: 'unknown', fix: null, watching: false };
  private listeners = new Set<Listener>();
  private watchId: number | null = null;
  private started = false;

  constructor(
    private readonly geo: Geolocation | undefined = typeof navigator === 'undefined'
      ? undefined
      : navigator.geolocation,
  ) {}

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): LocationState => this.state;

  /** Reads the permission state; starts watching only if already granted. */
  async init(): Promise<void> {
    if (this.started) return;
    this.started = true;

    if (!this.geo) {
      this.set({ permission: 'unsupported' });
      return;
    }

    document.addEventListener('visibilitychange', this.onVisibility);

    try {
      const status = await navigator.permissions.query({ name: 'geolocation' });
      this.set({ permission: status.state });
      status.addEventListener('change', () => {
        this.set({ permission: status.state });
        if (status.state === 'granted') this.startWatching();
        if (status.state === 'denied') this.stopWatching();
      });
    } catch {
      // Permissions API missing (some browsers): treat as "ask when needed".
      this.set({ permission: 'prompt' });
    }

    if (this.state.permission === 'granted') this.startWatching();
  }

  /** Call from a user gesture; shows the browser's permission prompt if needed. */
  enable(): void {
    this.startWatching();
  }

  /**
   * Resolves with a position (a recent one if we have it), or null if none
   * could be obtained in time.
   */
  requestFix(timeoutMs = 15_000): Promise<GeoFix | null> {
    const fresh = this.getFreshFix(15_000);
    if (fresh) return Promise.resolve(fresh);
    const geo = this.geo;
    if (!geo || this.state.permission === 'denied') return Promise.resolve(null);

    return new Promise((resolve) => {
      geo.getCurrentPosition(
        (position) => {
          const fix = toFix(position);
          this.set({ fix, permission: 'granted' });
          resolve(fix);
        },
        (error) => {
          if (error.code === error.PERMISSION_DENIED) this.set({ permission: 'denied' });
          resolve(null);
        },
        { enableHighAccuracy: true, maximumAge: 10_000, timeout: timeoutMs },
      );
    });
  }

  getFreshFix(maxAgeMs = FRESH_FIX_MS): GeoFix | null {
    const { fix } = this.state;
    if (!fix) return null;
    return Date.now() - Date.parse(fix.capturedAt) <= maxAgeMs ? fix : null;
  }

  private startWatching(): void {
    if (!this.geo || this.watchId !== null) return;
    this.watchId = this.geo.watchPosition(
      (position) => this.set({ fix: toFix(position), permission: 'granted' }),
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          this.stopWatching();
          this.set({ permission: 'denied' });
        }
        // Timeouts and "unavailable" are transient (tunnels, dead zones).
      },
      WATCH_OPTIONS,
    );
    this.set({ watching: true });
  }

  private stopWatching(): void {
    if (this.geo && this.watchId !== null) this.geo.clearWatch(this.watchId);
    this.watchId = null;
    this.set({ watching: false });
  }

  private onVisibility = (): void => {
    if (document.hidden) {
      this.stopWatching();
    } else if (this.state.permission === 'granted') {
      this.startWatching();
    }
  };

  private set(patch: Partial<LocationState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
}
