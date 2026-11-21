import { ActionIcon, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useState } from 'react';
import type { Photo } from '../domain/types';
import { photoStore } from '../state/instances';
import { usePhotoUrl } from '../state/photoHooks';
import classes from './Photos.module.css';

interface Props {
  photos: Photo[];
  /** Index into `photos` of the photo to show, or null when closed. */
  index: number | null;
  onIndexChange: (index: number | null) => void;
  readOnly: boolean;
  label: string;
}

export function PhotoViewer({ photos, index, onIndexChange, readOnly, label }: Props) {
  const photo = index === null ? undefined : photos[index];
  return (
    <Modal
      opened={photo !== undefined}
      onClose={() => onIndexChange(null)}
      title={label}
      fullScreen
      zIndex={400}
    >
      {photo && index !== null ? (
        <ViewerBody
          key={photo.id}
          photo={photo}
          position={`${index + 1} of ${photos.length}`}
          onPrevious={index > 0 ? () => onIndexChange(index - 1) : undefined}
          onNext={index < photos.length - 1 ? () => onIndexChange(index + 1) : undefined}
          onDeleted={() => onIndexChange(photos.length > 1 ? Math.max(0, index - 1) : null)}
          readOnly={readOnly}
          label={label}
        />
      ) : null}
    </Modal>
  );
}

interface BodyProps {
  photo: Photo;
  position: string;
  onPrevious?: () => void;
  onNext?: () => void;
  onDeleted: () => void;
  readOnly: boolean;
  label: string;
}

function ViewerBody({
  photo,
  position,
  onPrevious,
  onNext,
  onDeleted,
  readOnly,
  label,
}: BodyProps) {
  const url = usePhotoUrl(photo.id, 'full');
  const [confirming, setConfirming] = useState(false);

  const remove = () => {
    photoStore.remove(photo.id).then(onDeleted, (error: unknown) =>
      notifications.show({
        title: "Couldn't delete the photo",
        message: error instanceof Error ? error.message : String(error),
        color: 'red',
      }),
    );
  };

  return (
    <Stack gap="md">
      {url ? (
        <img className={classes.viewerImage} src={url} alt={label} />
      ) : (
        <Text c="dimmed" ta="center" py="xl">
          Loading…
        </Text>
      )}
      <Group justify="space-between">
        <Group gap="xs">
          <ActionIcon
            variant="default"
            size="lg"
            aria-label="Previous photo"
            onClick={onPrevious}
            disabled={!onPrevious}
          >
            <IconChevronLeft size={18} />
          </ActionIcon>
          <Text size="sm" c="dimmed">
            {position}
          </Text>
          <ActionIcon
            variant="default"
            size="lg"
            aria-label="Next photo"
            onClick={onNext}
            disabled={!onNext}
          >
            <IconChevronRight size={18} />
          </ActionIcon>
        </Group>
        {readOnly ? null : confirming ? (
          <Group gap="xs">
            <Button color="red" onClick={remove}>
              Confirm delete
            </Button>
            <Button variant="default" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </Group>
        ) : (
          <Button color="red" variant="subtle" onClick={() => setConfirming(true)}>
            Delete photo
          </Button>
        )}
      </Group>
    </Stack>
  );
}
