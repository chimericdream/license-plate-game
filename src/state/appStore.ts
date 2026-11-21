import { checkCooldown, type CooldownBlock } from '../domain/cooldown';
import { isoWithOffset } from '../domain/time';
import type { GeoFix, Sighting, StoreData, Trip } from '../domain/types';
import { mergeStoreData, type MergeStats } from '../storage/backup';
import { emptyStoreData } from '../storage/migrate';
import type { Repository } from '../storage/repository';
import { lastSightingFor, selectActiveTrip, selectTripSightings } from './selectors';

export interface AppState {
  status: 'loading' | 'ready' | 'error';
  data: StoreData;
  /** Set when loading failed or the last save did not go through. */
  error: string | null;
}

export type LogResult =
  | { ok: true; sighting: Sighting }
  | { ok: false; reason: 'no-active-trip' }
  | { ok: false; reason: 'cooldown'; block: CooldownBlock };

export interface StoreDeps {
  now: () => Date;
  uuid: () => string;
}

const defaultDeps: StoreDeps = {
  now: () => new Date(),
  uuid: () => crypto.randomUUID(),
};

type Listener = () => void;

/**
 * In-memory app state backed by a Repository. Works with React through
 * useSyncExternalStore (subscribe/getSnapshot), but has no React dependency.
 */
export class AppStore {
  private state: AppState = { status: 'loading', data: emptyStoreData(), error: null };
  private listeners = new Set<Listener>();
  private initPromise: Promise<void> | null = null;

  constructor(
    private readonly repo: Repository,
    private readonly deps: StoreDeps = defaultDeps,
  ) {}

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): AppState => this.state;

  /** Safe to call more than once; loads from the repository a single time. */
  init(): Promise<void> {
    this.initPromise ??= this.repo
      .load()
      .then((data) => this.set({ status: 'ready', data, error: null }))
      .catch((error: unknown) =>
        this.set({ ...this.state, status: 'error', error: describe(error) }),
      );
    return this.initPromise;
  }

  /** Starts a new trip and makes it the active one, ending any open trip. */
  createTrip(name: string): Trip {
    const nowIso = isoWithOffset(this.deps.now());
    const trip: Trip = {
      id: this.deps.uuid(),
      name: name.trim() || 'Road trip',
      startedAt: nowIso,
      endedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
    };
    const trips = this.state.data.trips.map((t) =>
      t.id === this.state.data.activeTripId && !t.endedAt
        ? { ...t, endedAt: nowIso, updatedAt: nowIso }
        : t,
    );
    this.commit({ ...this.state.data, activeTripId: trip.id, trips: [...trips, trip] });
    return trip;
  }

  /**
   * Brings in a parsed backup. "merge" combines by id (newer edits win);
   * "replace" swaps everything for the backup's contents.
   */
  importBackup(incoming: StoreData, mode: 'merge' | 'replace'): MergeStats | null {
    if (mode === 'replace') {
      this.commit(incoming);
      return null;
    }
    const { data, stats } = mergeStoreData(this.state.data, incoming);
    this.commit(data);
    return stats;
  }

  /** Ends a trip. If it was the active one, there is no active trip afterward. */
  endTrip(id: string): void {
    const nowIso = isoWithOffset(this.deps.now());
    const { data } = this.state;
    this.commit({
      ...data,
      activeTripId: data.activeTripId === id ? null : data.activeTripId,
      trips: data.trips.map((t) =>
        t.id === id && !t.endedAt ? { ...t, endedAt: nowIso, updatedAt: nowIso } : t,
      ),
    });
  }

  /** Makes an ended trip the active one again, ending whichever was active. */
  reopenTrip(id: string): void {
    const nowIso = isoWithOffset(this.deps.now());
    const { data } = this.state;
    this.commit({
      ...data,
      activeTripId: id,
      trips: data.trips.map((t) => {
        if (t.id === id) return { ...t, endedAt: null, updatedAt: nowIso };
        if (t.id === data.activeTripId && !t.endedAt) {
          return { ...t, endedAt: nowIso, updatedAt: nowIso };
        }
        return t;
      }),
    });
  }

  renameTrip(id: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    const nowIso = isoWithOffset(this.deps.now());
    this.commit({
      ...this.state.data,
      trips: this.state.data.trips.map((t) =>
        t.id === id ? { ...t, name: trimmed, updatedAt: nowIso } : t,
      ),
    });
  }

  /** Soft-deletes a trip along with its sightings. */
  deleteTrip(id: string): void {
    const nowIso = isoWithOffset(this.deps.now());
    const { data } = this.state;
    const mark = <T extends { deletedAt: string | null; updatedAt: string }>(item: T): T =>
      item.deletedAt ? item : { ...item, deletedAt: nowIso, updatedAt: nowIso };
    this.commit({
      ...data,
      activeTripId: data.activeTripId === id ? null : data.activeTripId,
      trips: data.trips.map((t) => (t.id === id ? mark(t) : t)),
      sightings: data.sightings.map((s) => (s.tripId === id ? mark(s) : s)),
    });
  }

  /** Edits the user-editable fields of a sighting. */
  updateSighting(
    id: string,
    patch: Partial<Pick<Sighting, 'regionId' | 'seenAt' | 'note' | 'location'>>,
  ): void {
    const nowIso = isoWithOffset(this.deps.now());
    this.commit({
      ...this.state.data,
      sightings: this.state.data.sightings.map((s) =>
        s.id === id && !s.deletedAt ? { ...s, ...patch, updatedAt: nowIso } : s,
      ),
    });
  }

  /**
   * Logs a plate for the active trip. `fix` should be a fresh position or
   * null. Unless `force` is set, a repeat inside the cooldown is refused.
   */
  logSighting(args: { regionId: string; fix: GeoFix | null; force?: boolean }): LogResult {
    const { data } = this.state;
    const trip = selectActiveTrip(data);
    if (!trip) return { ok: false, reason: 'no-active-trip' };

    const now = this.deps.now();
    if (!args.force) {
      const last = lastSightingFor(selectTripSightings(data, trip.id), args.regionId);
      const block = checkCooldown({ last, fix: args.fix, now });
      if (block) return { ok: false, reason: 'cooldown', block };
    }

    const nowIso = isoWithOffset(now);
    const sighting: Sighting = {
      id: this.deps.uuid(),
      tripId: trip.id,
      regionId: args.regionId,
      seenAt: nowIso,
      location: args.fix,
      note: '',
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
    };
    this.commit({ ...data, sightings: [...data.sightings, sighting] });
    return { ok: true, sighting };
  }

  /** Soft-deletes a sighting (used by Undo). */
  removeSighting(id: string): void {
    const nowIso = isoWithOffset(this.deps.now());
    this.commit({
      ...this.state.data,
      sightings: this.state.data.sightings.map((s) =>
        s.id === id && !s.deletedAt ? { ...s, deletedAt: nowIso, updatedAt: nowIso } : s,
      ),
    });
  }

  /** Adds a late-arriving position to a sighting that was saved without one. */
  attachLocation(id: string, fix: GeoFix): void {
    const target = this.state.data.sightings.find((s) => s.id === id);
    if (!target || target.deletedAt || target.location) return;
    const nowIso = isoWithOffset(this.deps.now());
    this.commit({
      ...this.state.data,
      sightings: this.state.data.sightings.map((s) =>
        s.id === id ? { ...s, location: fix, updatedAt: nowIso } : s,
      ),
    });
  }

  private commit(data: StoreData): void {
    this.set({ ...this.state, data });
    this.repo.save(data).then(
      () => {
        if (this.state.error?.startsWith('Could not save'))
          this.set({ ...this.state, error: null });
      },
      (error: unknown) =>
        this.set({ ...this.state, error: `Could not save your data: ${describe(error)}` }),
    );
  }

  private set(next: AppState): void {
    this.state = next;
    for (const listener of this.listeners) listener();
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
