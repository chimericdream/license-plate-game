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

/** The browser features the service depends on, so tests can fake them. */
export interface LocationEnv {
  geo: Geolocation | undefined;
  permissions:
    | {
        query(descriptor: { name: 'geolocation' }): Promise<{
          state: PermissionState;
          addEventListener(type: 'change', listener: () => void): void;
        }>;
      }
    | undefined;
  isHidden(): boolean;
  onVisibilityChange(listener: () => void): void;
}

function browserEnv(): LocationEnv {
  return {
    geo: typeof navigator === 'undefined' ? undefined : navigator.geolocation,
    permissions: typeof navigator === 'undefined' ? undefined : navigator.permissions,
    isHidden: () => document.hidden,
    onVisibilityChange: (listener) => document.addEventListener('visibilitychange', listener),
  };
}

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
 *
 * Once "armed" (a trip exists) it also asks for location on its own at launch
 * and whenever the app returns to the foreground. That matters because Chrome's
 * "Allow this time" grants lapse after you leave the app, which would
 * otherwise mean re-enabling location by hand every time.
 */
export class LocationService {
  private state: LocationState = { permission: 'unknown', fix: null, watching: false };
  private listeners = new Set<Listener>();
  private watchId: number | null = null;
  private started = false;
  /** Set once a trip exists; allows asking for permission without a tap. */
  private armed = false;
  /**
   * Set when the user dismissed the browser prompt. Stops us re-asking on
   * every return to the app until they choose to (via the banner button).
   */
  private autoPaused = false;

  constructor(private readonly env: LocationEnv = browserEnv()) {}

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): LocationState => this.state;

  /** Reads the permission state; starts watching if granted or armed. */
  async init(): Promise<void> {
    if (this.started) return;
    this.started = true;

    if (!this.env.geo) {
      this.set({ permission: 'unsupported' });
      return;
    }

    this.env.onVisibilityChange(this.onVisibility);

    if (this.env.permissions) {
      try {
        const status = await this.env.permissions.query({ name: 'geolocation' });
        this.set({ permission: status.state });
        status.addEventListener('change', () => this.onPermissionChange(status.state));
      } catch {
        this.set({ permission: 'prompt' });
      }
    } else {
      // Permissions API missing (some browsers): treat as "ask when needed".
      this.set({ permission: 'prompt' });
    }

    if (this.state.permission === 'granted' || this.armed) this.autoStart();
  }

  /**
   * Called once a trip exists. From here on the app asks for location by
   * itself at launch and on returning to the foreground.
   */
  arm(): void {
    this.armed = true;
    this.autoStart();
  }

  /** Call from a user gesture; shows the browser's permission prompt if needed. */
  enable(): void {
    this.armed = true;
    this.autoPaused = false;
    this.startWatching();
  }

  /**
   * Resolves with a position (a recent one if we have it), or null if none
   * could be obtained in time.
   */
  requestFix(timeoutMs = 15_000): Promise<GeoFix | null> {
    const fresh = this.getFreshFix(15_000);
    if (fresh) return Promise.resolve(fresh);
    const geo = this.env.geo;
    if (!geo || this.state.permission === 'denied') return Promise.resolve(null);

    return new Promise((resolve) => {
      geo.getCurrentPosition(
        (position) => {
          const fix = toFix(position);
          this.set({ fix, permission: 'granted' });
          resolve(fix);
        },
        (error) => {
          if (error.code === error.PERMISSION_DENIED) void this.handleDenied();
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

  /** Starts watching unless we know we shouldn't (blocked, unsupported, dismissed). */
  private autoStart(): void {
    if (!this.started || this.autoPaused || this.env.isHidden()) return;
    const { permission } = this.state;
    if (permission === 'denied' || permission === 'unsupported') return;
    this.startWatching();
  }

  private startWatching(): void {
    if (!this.env.geo || this.watchId !== null) return;
    this.watchId = this.env.geo.watchPosition(
      (position) => this.set({ fix: toFix(position), permission: 'granted' }),
      (error) => {
        if (error.code === error.PERMISSION_DENIED) void this.handleDenied();
        // Timeouts and "unavailable" are transient (tunnels, dead zones).
      },
      WATCH_OPTIONS,
    );
    this.set({ watching: true });
  }

  private stopWatching(): void {
    if (this.env.geo && this.watchId !== null) this.env.geo.clearWatch(this.watchId);
    this.watchId = null;
    this.set({ watching: false });
  }

  /**
   * The browser reports "permission denied" both when the user blocks location
   * and when they merely dismiss the prompt. Ask it which one it was.
   */
  private async handleDenied(): Promise<void> {
    this.stopWatching();
    let permission: PermissionStatus = 'denied';
    try {
      const status = await this.env.permissions?.query({ name: 'geolocation' });
      if (status) permission = status.state;
    } catch {
      // Keep "denied".
    }
    if (permission === 'prompt') this.autoPaused = true;
    this.set({ permission });
  }

  private onPermissionChange(state: PermissionState): void {
    this.set({ permission: state });
    if (state === 'granted') this.startWatching();
    else this.stopWatching();
    // A lapsed one-time grant lands here as "prompt"; ask again if we're in view.
    if (state === 'prompt') this.autoStart();
  }

  private onVisibility = (): void => {
    if (this.env.isHidden()) {
      this.stopWatching();
    } else if (this.state.permission === 'granted' || this.armed) {
      this.autoStart();
    }
  };

  private set(patch: Partial<LocationState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
}
