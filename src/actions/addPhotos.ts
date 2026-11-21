import { notifications } from '@mantine/notifications';
import { getRegion } from '../data/regions';
import type { Sighting } from '../domain/types';
import { pickPhotos } from '../photos/pickPhotos';
import { photoStore } from '../state/instances';

/**
 * Asks for photos (from the camera or the library) and attaches them to a
 * sighting. Call it directly from a tap handler.
 */
export async function addPhotosTo(
  sighting: Pick<Sighting, 'id' | 'tripId' | 'regionId'>,
  options: { camera: boolean },
): Promise<void> {
  const files = await pickPhotos({ camera: options.camera });
  if (files.length === 0) return;

  const { added, failures } = await photoStore.add(sighting, files);
  const name = getRegion(sighting.regionId)?.name ?? 'this plate';
  if (added > 0) {
    notifications.show({
      message: `${added === 1 ? 'Photo' : `${added} photos`} added to ${name}.`,
      color: 'green',
    });
  }
  if (failures.length > 0) {
    notifications.show({
      title:
        failures.length === 1 ? "Couldn't add a photo" : `Couldn't add ${failures.length} photos`,
      message: failures[0],
      color: 'red',
    });
  }
}
