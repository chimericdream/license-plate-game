import {
  Alert,
  Badge,
  Button,
  Card,
  FileButton,
  Group,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useEffect, useState } from 'react';
import { formatDate, isoWithOffset, wallClock } from '../domain/time';
import { useAppState } from '../state/hooks';
import { photoStore } from '../state/instances';
import { usePhotoState } from '../state/photoHooks';
import { backupFilename, countLive } from '../storage/backup';
import { createBackupZip } from '../storage/backupZip';
import { backupFile, canShareBackup, downloadFile, shareFile } from '../storage/exportFile';
import { requestPersistentStorage } from '../storage/persistence';
import { ImportModal } from './ImportModal';
import { BACKUP_FILE_TYPES, useBackupImport } from './useBackupImport';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function DataBackupCard() {
  const { data } = useAppState();
  const { photos } = usePhotoState();
  const [lastExport, setLastExport] = useLocalStorage<string | null>({
    key: 'plate-trip:ui:last-export',
    defaultValue: null,
  });
  const [persisted, setPersisted] = useState<boolean | null | undefined>(undefined);
  const [shareSupported] = useState(canShareBackup);
  const [includePhotos, setIncludePhotos] = useState(true);
  const [building, setBuilding] = useState(false);
  // A finished backup the browser wouldn't share on its own (the tap had expired while it was built).
  const [ready, setReady] = useState<File | null>(null);
  const backupImport = useBackupImport();

  useEffect(() => {
    void requestPersistentStorage().then(setPersisted);
  }, []);

  const { sightings } = countLive(data);
  const livePhotos = photos.filter((p) => !p.deletedAt);
  const photoBytes = livePhotos.reduce((sum, p) => sum + p.bytes, 0);
  const withPhotos = includePhotos && livePhotos.length > 0;
  const markExported = () => setLastExport(isoWithOffset(new Date()));

  const buildFile = async (): Promise<File> => {
    const now = new Date();
    if (!withPhotos) return backupFile(data, now);
    const zip = await createBackupZip(data, livePhotos, (id) => photoStore.getBlobs(id), now);
    return new File([zip], backupFilename(now, 'zip'), { type: 'application/zip' });
  };

  const shareReady = async (file: File) => {
    try {
      if ((await shareFile(file)) === 'shared') {
        markExported();
        setReady(null);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        setReady(file);
      } else {
        notifications.show({
          title: 'Could not share the backup',
          message: errorMessage(error),
          color: 'red',
        });
      }
    }
  };

  const run = async (action: (file: File) => Promise<void> | void) => {
    setBuilding(true);
    try {
      await action(await buildFile());
    } catch (error) {
      notifications.show({
        title: 'Could not create the backup',
        message: errorMessage(error),
        color: 'red',
      });
    } finally {
      setBuilding(false);
    }
  };

  const save = (file: File) => {
    downloadFile(file);
    setReady(null);
    markExported();
    notifications.show({ message: 'Backup saved to your downloads.', color: 'green' });
  };

  const lastExportText = lastExport
    ? `Last backup: ${formatDate(wallClock(lastExport).date)}`
    : 'No backup yet';

  return (
    <Card withBorder padding="md" radius="md">
      <Stack gap="sm">
        <Title order={5}>Backup</Title>
        <Text size="sm" c="dimmed">
          Your trips live only in this browser. Export a backup now and then so a cleared browser or
          a lost phone doesn't take your plates and photos with it.
        </Text>
        <Text size="sm" c={!lastExport && sightings > 0 ? 'yellow' : 'dimmed'}>
          {lastExportText}
        </Text>

        {livePhotos.length > 0 ? (
          <Switch
            label={`Include photos (${livePhotos.length}, about ${formatBytes(photoBytes)})`}
            description={
              includePhotos
                ? 'Saved as a .zip file.'
                : 'Photos stay on this device only; the backup holds just your plates.'
            }
            checked={includePhotos}
            onChange={(event) => setIncludePhotos(event.currentTarget.checked)}
          />
        ) : null}

        <Group gap="xs">
          <Button
            size="xs"
            loading={building}
            onClick={() => run(shareSupported ? shareReady : save)}
          >
            Export backup
          </Button>
          {shareSupported ? (
            <Button size="xs" variant="default" disabled={building} onClick={() => run(save)}>
              Download file
            </Button>
          ) : null}
          <FileButton onChange={backupImport.choose} accept={BACKUP_FILE_TYPES}>
            {(props) => (
              <Button size="xs" variant="default" loading={backupImport.reading} {...props}>
                Import backup
              </Button>
            )}
          </FileButton>
        </Group>

        {ready ? (
          <Alert color="blue" title="Your backup is ready">
            <Stack gap="xs">
              <Text size="sm">
                {ready.name} ({formatBytes(ready.size)}) took a moment to build, so your browser
                needs one more tap to share it.
              </Text>
              <Group gap="xs">
                <Button size="xs" onClick={() => shareReady(ready)}>
                  Share
                </Button>
                <Button size="xs" variant="default" onClick={() => save(ready)}>
                  Download
                </Button>
              </Group>
            </Stack>
          </Alert>
        ) : null}

        {backupImport.error ? (
          <Alert color="red" title="Couldn't import that file">
            {backupImport.error}
          </Alert>
        ) : null}

        {persisted === undefined ? null : (
          <Badge
            variant="light"
            color={persisted ? 'green' : persisted === false ? 'yellow' : 'gray'}
            style={{ alignSelf: 'flex-start' }}
          >
            {persisted
              ? 'Storage protected from automatic cleanup'
              : persisted === false
                ? 'Browser may clear this data when space is low'
                : 'Storage protection unavailable'}
          </Badge>
        )}
      </Stack>

      <ImportModal backup={backupImport.pending} onClose={backupImport.close} />
    </Card>
  );
}
