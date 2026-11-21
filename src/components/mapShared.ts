import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './SightingsMap.css';

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

/** The middle of the US, shown until there is something better to look at. */
export const DEFAULT_CENTER: L.LatLngTuple = [39.5, -98.35];
export const DEFAULT_ZOOM = 4;

/** A map with OpenStreetMap tiles that keeps itself sized to its container. */
export function createBaseMap(container: HTMLElement): { map: L.Map; dispose: () => void } {
  const map = L.map(container, { worldCopyJump: true });
  L.tileLayer(TILE_URL, {
    maxZoom: 19,
    attribution: ATTRIBUTION,
    // CORS requests give cacheable (non-opaque) responses for offline reuse.
    crossOrigin: true,
  }).addTo(map);
  map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);

  // Folding or rotating the phone resizes the container.
  const observer = new ResizeObserver(() => map.invalidateSize());
  observer.observe(container);

  return {
    map,
    dispose: () => {
      observer.disconnect();
      map.remove();
    },
  };
}

export function pinIcon(code: string, selected: boolean): L.DivIcon {
  // `code` comes from our own region table, never from user input.
  return L.divIcon({
    className: 'pt-icon',
    html: `<span class="pt-pin"${selected ? ' data-selected' : ''}>${code}</span>`,
    iconSize: [36, 24],
    iconAnchor: [18, 12],
  });
}
