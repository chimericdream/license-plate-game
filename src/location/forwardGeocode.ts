import { GeocodeError, formatPlace, type NominatimAddress } from './reverseGeocode';

export interface PlaceMatch {
  /** Stable key for lists (Nominatim's own id when it gives one). */
  id: string;
  /** "Grand Junction, Colorado" or the service's longer name when that's all there is. */
  label: string;
  lat: number;
  lng: number;
}

interface NominatimHit {
  place_id?: number;
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: NominatimAddress & { country_code?: string };
}

type FetchLike = (url: string) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

/** The countries the plate list covers, so "Portland" doesn't turn up in Portugal. */
const COUNTRY_CODES = 'us,ca,mx';
const MAX_RESULTS = 5;

/**
 * Finds places by name (e.g. "Moab, UT") using OpenStreetMap's Nominatim
 * service. Meant to run on an explicit search, never as you type, to stay
 * within the service's usage policy. Throws a GeocodeError when the service
 * can't be reached; resolves an empty list when nothing matches.
 */
export async function searchPlaces(
  query: string,
  fetchImpl: FetchLike = (url) => fetch(url),
): Promise<PlaceMatch[]> {
  const text = query.trim();
  if (text === '') return [];

  const url =
    'https://nominatim.openstreetmap.org/search' +
    `?format=jsonv2&addressdetails=1&limit=${MAX_RESULTS}&countrycodes=${COUNTRY_CODES}` +
    `&q=${encodeURIComponent(text)}`;

  let response;
  try {
    response = await fetchImpl(url);
  } catch (error) {
    throw new GeocodeError(`Could not reach the search service: ${String(error)}`);
  }
  if (!response.ok) throw new GeocodeError(`Search service returned ${response.status}`);

  const body = (await response.json()) as unknown;
  if (!Array.isArray(body)) return [];

  const seen = new Set<string>();
  const matches: PlaceMatch[] = [];
  for (const hit of body as NominatimHit[]) {
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (hit.lat === undefined || hit.lon === undefined) continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;

    const label = formatPlace(hit.address) ?? hit.display_name?.trim() ?? '';
    if (label === '') continue;
    // Several hits can share a name (a town and its county seat); keep the first.
    if (seen.has(label)) continue;
    seen.add(label);
    matches.push({ id: String(hit.place_id ?? `${lat},${lng}`), label, lat, lng });
  }
  return matches;
}
