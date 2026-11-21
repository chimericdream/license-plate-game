import { describe, expect, it } from 'vitest';
import { searchPlaces } from './forwardGeocode';
import { GeocodeError } from './reverseGeocode';

const ok = (body: unknown) => async () => ({ ok: true, status: 200, json: async () => body });

describe('searchPlaces', () => {
  it('asks Nominatim for the typed text, limited to our countries', async () => {
    let requested = '';
    await searchPlaces('  Moab, UT ', async (url) => {
      requested = url;
      return { ok: true, status: 200, json: async () => [] };
    });
    expect(requested).toContain('nominatim.openstreetmap.org/search');
    expect(requested).toContain('q=Moab%2C%20UT');
    expect(requested).toContain('countrycodes=us,ca,mx');
  });

  it('turns hits into labelled coordinates', async () => {
    const matches = await searchPlaces(
      'moab',
      ok([
        {
          place_id: 7,
          lat: '38.5733',
          lon: '-109.5498',
          display_name: 'Moab, Grand County, Utah, United States',
          address: { city: 'Moab', state: 'Utah' },
        },
      ]),
    );
    expect(matches).toEqual([{ id: '7', label: 'Moab, Utah', lat: 38.5733, lng: -109.5498 }]);
  });

  it('falls back to the long name, drops duplicates and unusable hits', async () => {
    const matches = await searchPlaces(
      'x',
      ok([
        { place_id: 1, lat: '10', lon: '20', display_name: 'Somewhere, Far Away' },
        { place_id: 2, lat: '11', lon: '21', display_name: 'Somewhere, Far Away' },
        { place_id: 3, lat: 'nope', lon: '21', display_name: 'Broken' },
        { place_id: 4, lat: '95', lon: '21', display_name: 'Off the globe' },
        { place_id: 5, display_name: 'No position' },
        { place_id: 6, lat: '1', lon: '2' },
      ]),
    );
    expect(matches.map((m) => m.id)).toEqual(['1']);
    expect(matches[0]?.label).toBe('Somewhere, Far Away');
  });

  it('returns nothing for blank text or a non-list answer, without calling out', async () => {
    let calls = 0;
    const counting = async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => ({ error: 'bad' }) };
    };
    expect(await searchPlaces('   ', counting)).toEqual([]);
    expect(calls).toBe(0);
    expect(await searchPlaces('Moab', counting)).toEqual([]);
  });

  it('throws a GeocodeError on HTTP errors and network failures', async () => {
    await expect(
      searchPlaces('Moab', async () => ({ ok: false, status: 429, json: async () => ({}) })),
    ).rejects.toThrow(GeocodeError);
    await expect(
      searchPlaces('Moab', async () => {
        throw new TypeError('Failed to fetch');
      }),
    ).rejects.toThrow(GeocodeError);
  });
});
