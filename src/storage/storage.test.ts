import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, emptyStoreData, migrate } from './migrate';

describe('migrate', () => {
  it('returns empty data for nothing stored', () => {
    expect(migrate(null)).toEqual(emptyStoreData());
  });

  it('accepts current-version data', () => {
    const data = { ...emptyStoreData(), activeTripId: 't1' };
    expect(migrate(data)).toEqual(data);
  });

  it('rejects data from a newer app version', () => {
    expect(() => migrate({ ...emptyStoreData(), schemaVersion: SCHEMA_VERSION + 1 })).toThrow(
      /newer version/,
    );
  });

  it('rejects malformed data', () => {
    expect(() => migrate('nope')).toThrow();
    expect(() => migrate({ schemaVersion: 1, trips: [] })).toThrow();
    expect(() => migrate({ trips: [], sightings: [] })).toThrow();
  });
});
