import { describe, expect, it } from 'vitest';
import { GeocodeError, formatPlace, reverseGeocode } from './reverseGeocode';

const ok = (body: unknown) => async () => ({ ok: true, status: 200, json: async () => body });

describe('formatPlace', () => {
  it('combines locality and state', () => {
    expect(formatPlace({ city: 'Grand Junction', state: 'Colorado' })).toBe(
      'Grand Junction, Colorado',
    );
  });

  it('prefers city over town over village', () => {
    expect(formatPlace({ town: 'Moab', village: 'Spring Glen', state: 'Utah' })).toBe('Moab, Utah');
    expect(formatPlace({ village: 'Spring Glen', hamlet: 'X', state: 'Utah' })).toBe(
      'Spring Glen, Utah',
    );
  });

  it('falls back to county, then to just the state', () => {
    expect(formatPlace({ county: 'Mesa County', state: 'Colorado' })).toBe('Mesa County, Colorado');
    expect(formatPlace({ state: 'Wyoming' })).toBe('Wyoming');
  });

  it('does not repeat itself or invent a result', () => {
    expect(formatPlace({ city: 'Washington', state: 'Washington' })).toBe('Washington');
    expect(formatPlace({})).toBeNull();
    expect(formatPlace(undefined)).toBeNull();
  });
});

describe('reverseGeocode', () => {
  it('asks Nominatim at city zoom and formats the answer', async () => {
    let requested = '';
    const place = await reverseGeocode(39.0639, -108.5506, async (url) => {
      requested = url;
      return {
        ok: true,
        status: 200,
        json: async () => ({ address: { city: 'Grand Junction', state: 'Colorado' } }),
      };
    });
    expect(place).toBe('Grand Junction, Colorado');
    expect(requested).toContain('nominatim.openstreetmap.org/reverse');
    expect(requested).toContain('lat=39.0639');
    expect(requested).toContain('lon=-108.5506');
    expect(requested).toContain('zoom=10');
  });

  it('returns null where there is no address', async () => {
    expect(await reverseGeocode(0, 0, ok({ error: 'Unable to geocode' }))).toBeNull();
  });

  it('throws a GeocodeError on HTTP errors and network failures', async () => {
    await expect(
      reverseGeocode(1, 2, async () => ({ ok: false, status: 429, json: async () => ({}) })),
    ).rejects.toThrow(GeocodeError);
    await expect(
      reverseGeocode(1, 2, async () => {
        throw new TypeError('Failed to fetch');
      }),
    ).rejects.toThrow(GeocodeError);
  });
});
