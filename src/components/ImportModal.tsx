import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { useAppState } from '../state/hooks';
import { appStore, photoStore } from '../state/instances';
import { liveSightingIds } from '../state/photoStore';
import { usePhotoState } from '../state/photoHooks';
import { countLive, mergeStoreData } from '../storage/backup';
import type { ParsedBackup } from '../storage/backupZip';

interface Props {
  /** A parsed backup waiting for the user's decision, or null when closed. */
  backup: ParsedBackup | null;
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

function ImportChoices({ backup, onClose }: { backup: ParsedBackup; onClose: () => void }) {
  const { data } = useAppState();
  const { photos: storedPhotos } = usePhotoState();
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  const [busy, setBusy] = useState(false);

  const incoming = countLive(backup.data);
  const { stats } = mergeStoreData(data, backup.data);
  const hasPhotos = backup.photos.length > 0;

  // Without photos in the backup, a replace removes photos whose plate isn't in it.
  const backupPlates = liveSightingIds(backup.data);
  const photosLost = storedPhotos.filter(
    (p) => !p.deletedAt && !backupPlates.has(p.sightingId),
  ).length;

  const run = async (mode: 'merge' | 'replace') => {
    setBusy(true);
    try {
      appStore.importBackup(backup.data, mode);
      let added = 0;
      if (hasPhotos) {
        const live = liveSightingIds(appStore.getSnapshot().data);
        added = (await photoStore.importPhotos(backup.photos, mode, live)).added;
      }
      const photoNote = hasPhotos ? ` ${plural(added, 'photo')} added.` : '';
      notifications.show({
        message:
          mode === 'merge'
            ? `Backup merged into your data.${photoNote}`
            : `Your data was replaced with the backup.${photoNote}`,
        color: 'green',
      });
    } catch (error) {
      notifications.show({
        title: hasPhotos ? 'Your plates were imported, but the photos were not' : 'Import failed',
        message: error instanceof Error ? error.message : String(error),
        color: 'red',
      });
    } finally {
      setBusy(false);
      onClose();
    }
  };

  return (
    <Stack gap="md">
      <Text>
        This backup has {plural(incoming.trips, 'trip')}, {plural(incoming.sightings, 'plate')} and{' '}
        {plural(backup.photos.length, 'photo')}.
      </Text>
      <Text size="sm" c="dimmed">
        <b>Merge</b> keeps everything already on this device and adds what's missing:{' '}
        {plural(stats.tripsAdded, 'new trip')}, {plural(stats.sightingsAdded, 'new plate')} and{' '}
        {plural(stats.tripsUpdated + stats.sightingsUpdated, 'newer edit')}
        {hasPhotos ? ', plus any photos this device doesn’t have' : ''}. If both copies changed the
        same item, the most recent edit wins.
      </Text>
      <Button loading={busy} onClick={() => run('merge')}>
        Merge into my data
      </Button>

      {confirmingReplace ? (
        <Stack gap="xs">
          <Text size="sm" c="red">
            This erases the trips and plates on this device and uses only the backup
            {hasPhotos
              ? ', photos included'
              : photosLost > 0
                ? `. This backup has no photos, so ${plural(photosLost, 'photo')} on this device will be removed too`
                : ''}
            . Export a backup first if you might want your current data back.
          </Text>
          <Group gap="xs">
            <Button color="red" loading={busy} onClick={() => run('replace')}>
              Replace everything
            </Button>
            <Button variant="default" disabled={busy} onClick={() => setConfirmingReplace(false)}>
              Cancel
            </Button>
          </Group>
        </Stack>
      ) : (
        <Button
          color="red"
          variant="subtle"
          disabled={busy}
          onClick={() => setConfirmingReplace(true)}
        >
          Replace everything instead…
        </Button>
      )}
    </Stack>
  );
}
