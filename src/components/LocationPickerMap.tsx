import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { createBaseMap, pinIcon } from './mapShared';

export interface LatLng {
  lat: number;
  lng: number;
}

/** A request to move the pin somewhere (e.g. a search result). `seq` makes repeats count. */
export interface JumpTo extends LatLng {
  seq: number;
}

interface Props {
  /** Where the pin starts, if the sighting already has a position. */
  initial: LatLng | null;
  /** Where to look when there is no pin yet (e.g. the phone's last position). */
  center: LatLng | null;
  /** Short label for the pin, such as the state code. */
  code: string;
  /** Put the pin here and bring it into view; a new `seq` repeats the move. */
  jumpTo: JumpTo | null;
  onPick: (point: LatLng) => void;
}

const SEARCH_ZOOM = 12;

/** A map where tapping (or dragging the pin) chooses a spot. */
export default function LocationPickerMap({ initial, center, code, jumpTo, onPick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onPickRef = useRef(onPick);
  const placeRef = useRef<((point: L.LatLng, zoom?: number) => void) | null>(null);
  // Only the first values matter: the map is created once and then driven by taps.
  const startRef = useRef({ initial, center, code });

  useEffect(() => {
    onPickRef.current = onPick;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const start = startRef.current;
    const { map, dispose } = createBaseMap(container);
    let marker: L.Marker | null = null;

    const choose = (point: L.LatLng) => {
      const wrapped = point.wrap();
      onPickRef.current({ lat: wrapped.lat, lng: wrapped.lng });
    };

    const ensureMarker = (point: L.LatLngExpression) => {
      if (marker) {
        marker.setLatLng(point);
        return;
      }
      marker = L.marker(point, {
        icon: pinIcon(start.code, true),
        draggable: true,
        autoPan: true,
        title: 'Drag to fine-tune',
      })
        .on('dragend', () => marker && choose(marker.getLatLng()))
        .addTo(map);
    };

    const place = (point: L.LatLng, zoom?: number) => {
      ensureMarker(point);
      if (zoom !== undefined) map.setView(point, zoom);
      choose(point);
    };
    placeRef.current = place;

    if (start.initial) {
      ensureMarker([start.initial.lat, start.initial.lng]);
      map.setView([start.initial.lat, start.initial.lng], 14);
    } else if (start.center) {
      map.setView([start.center.lat, start.center.lng], SEARCH_ZOOM);
    }

    map.on('click', (event: L.LeafletMouseEvent) => place(event.latlng));
    return () => {
      placeRef.current = null;
      dispose();
    };
  }, []);

  useEffect(() => {
    if (jumpTo) placeRef.current?.(L.latLng(jumpTo.lat, jumpTo.lng), SEARCH_ZOOM);
  }, [jumpTo]);

  return (
    <div
      ref={containerRef}
      className="pt-map pt-map--tall"
      role="region"
      aria-label="Map: tap to choose the spot"
    />
  );
}
