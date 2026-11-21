import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef } from 'react';
import { getRegion } from '../data/regions';
import type { Sighting } from '../domain/types';
import './SightingsMap.css';

interface Props {
  sightings: readonly Sighting[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

type Located = Sighting & { location: NonNullable<Sighting['location']> };

function pinIcon(code: string, selected: boolean): L.DivIcon {
  // `code` comes from our own region table, never from user input.
  return L.divIcon({
    className: 'pt-icon',
    html: `<span class="pt-pin"${selected ? ' data-selected' : ''}>${code}</span>`,
    iconSize: [36, 24],
    iconAnchor: [18, 12],
  });
}

/** Pins for every located sighting, joined in time order to sketch the route. */
export default function SightingsMap({ sightings, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);

  const located = useMemo(
    () =>
      sightings
        .filter((s): s is Located => s.location !== null)
        .toSorted((a, b) => Date.parse(a.seenAt) - Date.parse(b.seenAt)),
    [sightings],
  );
  const locatedRef = useRef(located);
  const fitKey = located.map((s) => s.id).join(',');

  // Keep the latest values where the long-lived Leaflet callbacks can read them.
  // Declared first so it runs before the effects below.
  useEffect(() => {
    onSelectRef.current = onSelect;
    locatedRef.current = located;
  });

  // Create the map once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = L.map(container, { worldCopyJump: true });
    L.tileLayer(TILE_URL, {
      maxZoom: 19,
      attribution: ATTRIBUTION,
      // CORS requests give cacheable (non-opaque) responses for offline reuse.
      crossOrigin: true,
    }).addTo(map);
    map.setView([39.5, -98.35], 4); // the middle of the US until we have pins
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    // Folding or rotating the phone resizes the container.
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Redraw the pins and route whenever the data or the selection changes.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (located.length > 1) {
      L.polyline(
        located.map((s) => [s.location.lat, s.location.lng] as L.LatLngTuple),
        { color: '#1c7ed6', weight: 2, opacity: 0.55, dashArray: '4 6' },
      ).addTo(layer);
    }

    for (const sighting of located) {
      const region = getRegion(sighting.regionId);
      L.marker([sighting.location.lat, sighting.location.lng], {
        icon: pinIcon(region?.code ?? '?', sighting.id === selectedId),
        title: region?.name ?? sighting.regionId,
        zIndexOffset: sighting.id === selectedId ? 1000 : 0,
      })
        .on('click', () => onSelectRef.current(sighting.id))
        .addTo(layer);
    }
  }, [located, selectedId]);

  // Re-frame only when the set of pins changes, not when one is selected.
  useEffect(() => {
    const map = mapRef.current;
    const pins = locatedRef.current;
    // `fitKey` is empty when there are no pins; it changes when the set of pins does.
    if (!map || !fitKey || pins.length === 0) return;
    const bounds = L.latLngBounds(pins.map((s) => [s.location.lat, s.location.lng]));
    if (pins.length === 1) map.setView(bounds.getCenter(), 11);
    else map.fitBounds(bounds, { padding: [32, 32], maxZoom: 12 });
  }, [fitKey]);

  return <div ref={containerRef} className="pt-map" role="region" aria-label="Map of sightings" />;
}
