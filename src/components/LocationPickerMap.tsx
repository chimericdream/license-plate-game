import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { createBaseMap, pinIcon } from './mapShared';

export interface LatLng {
  lat: number;
  lng: number;
}

interface Props {
  /** Where the pin starts, if the sighting already has a position. */
  initial: LatLng | null;
  /** Where to look when there is no pin yet (e.g. the phone's last position). */
  center: LatLng | null;
  /** Short label for the pin, such as the state code. */
  code: string;
  onPick: (point: LatLng) => void;
}

/** A map where tapping (or dragging the pin) chooses a spot. */
export default function LocationPickerMap({ initial, center, code, onPick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onPickRef = useRef(onPick);
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

    const place = (point: L.LatLng) => {
      if (marker) {
        marker.setLatLng(point);
      } else {
        marker = L.marker(point, {
          icon: pinIcon(start.code, true),
          draggable: true,
          autoPan: true,
          title: 'Drag to fine-tune',
        })
          .on('dragend', () => marker && choose(marker.getLatLng()))
          .addTo(map);
      }
      choose(point);
    };

    if (start.initial) {
      marker = L.marker([start.initial.lat, start.initial.lng], {
        icon: pinIcon(start.code, true),
        draggable: true,
        autoPan: true,
        title: 'Drag to fine-tune',
      })
        .on('dragend', () => marker && choose(marker.getLatLng()))
        .addTo(map);
      map.setView([start.initial.lat, start.initial.lng], 14);
    } else if (start.center) {
      map.setView([start.center.lat, start.center.lng], 12);
    }

    map.on('click', (event: L.LeafletMouseEvent) => place(event.latlng));
    return dispose;
  }, []);

  return (
    <div
      ref={containerRef}
      className="pt-map pt-map--tall"
      role="region"
      aria-label="Map: tap to choose the spot"
    />
  );
}
