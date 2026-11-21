const EARTH_RADIUS_MILES = 3958.8;

export interface LatLng {
  lat: number;
  lng: number;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance (haversine), in miles. */
export function distanceMiles(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}
