/** The parts of a Nominatim `address` object we use. */
export interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  municipality?: string;
  suburb?: string;
  county?: string;
  state?: string;
}

/** "Grand Junction, Colorado"; falls back gracefully; null when there's nothing useful. */
export function formatPlace(address: NominatimAddress | undefined): string | null {
  if (!address) return null;
  const locality =
    address.city ??
    address.town ??
    address.village ??
    address.hamlet ??
    address.municipality ??
    address.suburb ??
    address.county;
  const { state } = address;
  if (locality && state && locality !== state) return `${locality}, ${state}`;
  return locality ?? state ?? null;
}

export class GeocodeError extends Error {}

type FetchLike = (url: string) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

/**
 * Looks up the town for a coordinate using OpenStreetMap's Nominatim service.
 * Resolves null when the point has no address (open ocean, etc.) and throws a
 * GeocodeError when the service can't be reached or rate-limits us.
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
  fetchImpl: FetchLike = (url) => fetch(url),
): Promise<string | null> {
  const url =
    'https://nominatim.openstreetmap.org/reverse' +
    `?format=jsonv2&zoom=10&addressdetails=1&lat=${lat}&lon=${lng}`;

  let response;
  try {
    response = await fetchImpl(url);
  } catch (error) {
    throw new GeocodeError(`Could not reach the lookup service: ${String(error)}`);
  }
  if (!response.ok) throw new GeocodeError(`Lookup service returned ${response.status}`);

  const body = (await response.json()) as { error?: string; address?: NominatimAddress };
  if (body.error) return null;
  return formatPlace(body.address);
}
