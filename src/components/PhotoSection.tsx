import { Button, Group, Stack, Text } from '@mantine/core';
import { IconCamera, IconPhoto } from '@tabler/icons-react';
import { useState } from 'react';
import { addPhotosTo } from '../actions/addPhotos';
import { getRegion } from '../data/regions';
import type { Sighting } from '../domain/types';
import { usePhotoState, usePhotosBySighting } from '../state/photoHooks';
import { PhotoThumb } from './PhotoThumb';
import { PhotoViewer } from './PhotoViewer';
import classes from './Photos.module.css';

/** The photos of one sighting, with buttons to add more. Lives in the sighting editor. */
export function PhotoSection({ sighting, readOnly }: { sighting: Sighting; readOnly: boolean }) {
  const { status } = usePhotoState();
  const photos = usePhotosBySighting().get(sighting.id) ?? [];
  const [viewing, setViewing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const regionName = getRegion(sighting.regionId)?.name ?? 'Plate';

  const add = async (camera: boolean) => {
    setBusy(true);
    try {
      await addPhotosTo(sighting, { camera });
    } finally {
      setBusy(false);
    }
  };

  if (readOnly && photos.length === 0) return null;

  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        Photos
      </Text>
      {photos.length > 0 ? (
        <div className={classes.grid}>
          {photos.map((photo, index) => (
            <button
              key={photo.id}
              type="button"
              className={classes.tile}
              aria-label={`${regionName} photo ${index + 1} of ${photos.length}`}
              onClick={() => setViewing(index)}
            >
              <PhotoThumb photo={photo} alt="" />
            </button>
          ))}
        </div>
      ) : null}
      {readOnly ? null : (
        <Group gap="xs">
          <Button
            size="xs"
            variant="light"
            leftSection={<IconCamera size={16} aria-hidden />}
            loading={busy}
            disabled={status !== 'ready'}
            onClick={() => add(true)}
          >
            Take photo
          </Button>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconPhoto size={16} aria-hidden />}
            disabled={busy || status !== 'ready'}
            onClick={() => add(false)}
          >
            Add from library
          </Button>
        </Group>
      )}
      <PhotoViewer
        photos={photos}
        index={viewing}
        onIndexChange={setViewing}
        readOnly={readOnly}
        label={regionName}
      />
    </Stack>
  );
}
