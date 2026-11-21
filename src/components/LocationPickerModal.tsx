import { Button, Group, Loader, Modal, Stack, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { Suspense, lazy, useState } from 'react';
import { locationService } from '../state/instances';
import { useOnline } from '../state/useOnline';
import type { LatLng } from './LocationPickerMap';

// Leaflet is only fetched when someone opens the picker.
const LocationPickerMap = lazy(() => import('./LocationPickerMap'));

interface Props {
  opened: boolean;
  /** The sighting's current position, if it has one. */
  initial: LatLng | null;
  /** Short label for the pin, such as the state code. */
  code: string;
  onClose: () => void;
  onConfirm: (point: LatLng) => void;
}

export function LocationPickerModal({ opened, initial, code, onClose, onConfirm }: Props) {
  const compact = useMediaQuery('(max-width: 36em)');
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Choose the spot"
      fullScreen={compact}
      centered
      zIndex={400}
    >
      {opened ? (
        <Picker initial={initial} code={code} onClose={onClose} onConfirm={onConfirm} />
      ) : null}
    </Modal>
  );
}

function Picker({ initial, code, onClose, onConfirm }: Omit<Props, 'opened'>) {
  const online = useOnline();
  const [picked, setPicked] = useState<LatLng | null>(initial);
  // Where to look if there's no pin yet: the last position the phone reported.
  const [center] = useState(() => locationService.getSnapshot().fix);

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {initial
          ? 'Tap the map to move the pin, or drag it to fine-tune.'
          : 'Tap the map where you saw it. You can drag the pin to fine-tune.'}
      </Text>
      <Suspense
        fallback={
          <Group justify="center" py="xl">
            <Loader />
          </Group>
        }
      >
        <LocationPickerMap initial={initial} center={center} code={code} onPick={setPicked} />
      </Suspense>
      {!online ? (
        <Text size="xs" c="yellow">
          You're offline, so the map may be blank where you haven't looked before. You can still tap
          to choose a spot.
        </Text>
      ) : null}
      <Text size="sm" c={picked ? undefined : 'dimmed'}>
        {picked ? `${picked.lat.toFixed(5)}, ${picked.lng.toFixed(5)}` : 'No spot chosen yet.'}
      </Text>
      <Group justify="flex-end" gap="xs">
        <Button variant="default" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={!picked} onClick={() => picked && onConfirm(picked)}>
          Use this spot
        </Button>
      </Group>
    </Stack>
  );
}
