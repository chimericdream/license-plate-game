import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import type { StoreData } from '../domain/types';
import { useAppState } from '../state/hooks';
import { appStore } from '../state/instances';
import { countLive, mergeStoreData } from '../storage/backup';

interface Props {
  /** A parsed backup waiting for the user's decision, or null when closed. */
  backup: StoreData | null;
  onClose: () => void;
}

export function ImportModal({ backup, onClose }: Props) {
  return (
    <Modal opened={backup !== null} onClose={onClose} title="Import backup" centered>
      {backup ? <ImportChoices backup={backup} onClose={onClose} /> : null}
    </Modal>
  );
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function ImportChoices({ backup, onClose }: { backup: StoreData; onClose: () => void }) {
  const { data } = useAppState();
  const [confirmingReplace, setConfirmingReplace] = useState(false);

  const incoming = countLive(backup);
  const { stats } = mergeStoreData(data, backup);

  const merge = () => {
    appStore.importBackup(backup, 'merge');
    notifications.show({ message: 'Backup merged into your data.', color: 'green' });
    onClose();
  };

  const replace = () => {
    appStore.importBackup(backup, 'replace');
    notifications.show({ message: 'Your data was replaced with the backup.', color: 'green' });
    onClose();
  };

  return (
    <Stack gap="md">
      <Text>
        This backup has {plural(incoming.trips, 'trip')} and {plural(incoming.sightings, 'plate')}.
      </Text>
      <Text size="sm" c="dimmed">
        <b>Merge</b> keeps everything already on this device and adds what's missing:{' '}
        {plural(stats.tripsAdded, 'new trip')}, {plural(stats.sightingsAdded, 'new plate')} and{' '}
        {plural(stats.tripsUpdated + stats.sightingsUpdated, 'newer edit')}. If both copies changed
        the same item, the most recent edit wins.
      </Text>
      <Button onClick={merge}>Merge into my data</Button>

      {confirmingReplace ? (
        <Stack gap="xs">
          <Text size="sm" c="red">
            This erases the trips and plates on this device and uses only the backup. Export a
            backup first if you might want your current data back.
          </Text>
          <Group gap="xs">
            <Button color="red" onClick={replace}>
              Replace everything
            </Button>
            <Button variant="default" onClick={() => setConfirmingReplace(false)}>
              Cancel
            </Button>
          </Group>
        </Stack>
      ) : (
        <Button color="red" variant="subtle" onClick={() => setConfirmingReplace(true)}>
          Replace everything instead…
        </Button>
      )}
    </Stack>
  );
}
