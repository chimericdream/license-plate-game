export interface Settings {
  /**
   * Look up a town name for each located plate. Off by default because it
   * sends the coordinates to a third-party service (OpenStreetMap Nominatim).
   */
  lookUpPlaces: boolean;
}

export const DEFAULT_SETTINGS: Settings = { lookUpPlaces: false };
export const SETTINGS_KEY = 'plate-trip:settings';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
type Listener = () => void;

function parse(raw: string | null): Settings {
  if (raw === null) return DEFAULT_SETTINGS;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value === 'object' && value !== null) {
      const { lookUpPlaces } = value as Record<string, unknown>;
      return { lookUpPlaces: lookUpPlaces === true };
    }
  } catch {
    // Fall through to the defaults.
  }
  return DEFAULT_SETTINGS;
}

/** Small preferences store, kept separate from trip data (and from backups). */
export class SettingsStore {
  private state: Settings;
  private listeners = new Set<Listener>();

  constructor(private readonly storage: StorageLike) {
    try {
      this.state = parse(storage.getItem(SETTINGS_KEY));
    } catch {
      this.state = DEFAULT_SETTINGS;
    }
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): Settings => this.state;

  update(patch: Partial<Settings>): void {
    this.state = { ...this.state, ...patch };
    try {
      this.storage.setItem(SETTINGS_KEY, JSON.stringify(this.state));
    } catch {
      // Not persisted (private mode / full); the choice still applies this session.
    }
    for (const listener of this.listeners) listener();
  }
}
