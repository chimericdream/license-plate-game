import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { Photo } from '../domain/types';
import { photoStore } from './instances';

export function usePhotoState() {
  return useSyncExternalStore(photoStore.subscribe, photoStore.getSnapshot);
}

/** Live photos grouped by the plate they belong to, oldest first. */
export function usePhotosBySighting(): Map<string, Photo[]> {
  const { photos } = usePhotoState();
  return useMemo(() => {
    const groups = new Map<string, Photo[]>();
    for (const photo of photos.toSorted(
      (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
    )) {
      if (photo.deletedAt) continue;
      const list = groups.get(photo.sightingId);
      if (list) list.push(photo);
      else groups.set(photo.sightingId, [photo]);
    }
    return groups;
  }, [photos]);
}

/** A temporary object URL for a photo's image data, released when no longer needed. */
export function usePhotoUrl(id: string, kind: 'thumb' | 'full'): string | null {
  const [loaded, setLoaded] = useState<{ id: string; kind: string; url: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    void photoStore.getBlob(id, kind).then((blob) => {
      if (!blob || cancelled) return;
      url = URL.createObjectURL(blob);
      setLoaded({ id, kind, url });
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, kind]);

  return loaded?.id === id && loaded.kind === kind ? loaded.url : null;
}
