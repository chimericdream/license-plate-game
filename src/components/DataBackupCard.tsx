import { Alert, Badge, Button, Card, FileButton, Group, Stack, Text, Title } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useEffect, useState } from 'react';
import { formatDate, isoWithOffset, wallClock } from '../domain/time';
import { useAppState } from '../state/hooks';
import { countLive } from '../storage/backup';
import { canShareBackup, downloadBackup, shareBackup } from '../storage/exportFile';
import { requestPersistentStorage } from '../storage/persistence';
import { ImportModal } from './ImportModal';
import { useBackupImport } from './useBackupImport';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function DataBackupCard() {
  const { data } = useAppState();
  const [lastExport, setLastExport] = useLocalStorage<string | null>({
    key: 'plate-trip:ui:last-export',
    defaultValue: null,
  });
  const [persisted, setPersisted] = useState<boolean | null | undefined>(undefined);
  const [shareSupported] = useState(canShareBackup);
  const backupImport = useBackupImport();

  useEffect(() => {
    void requestPersistentStorage().then(setPersisted);
  }, []);

  const { sightings } = countLive(data);
  const markExported = () => setLastExport(isoWithOffset(new Date()));

  const exportWithShare = async () => {
    try {
      if ((await shareBackup(data)) === 'shared') markExported();
    } catch (error) {
      notifications.show({
        title: 'Could not share the backup',
        message: errorMessage(error),
        color: 'red',
      });
    }
  };

  const exportDownload = () => {
    downloadBackup(data);
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
          a lost phone doesn't take your plates with it.
        </Text>
        <Text size="sm" c={!lastExport && sightings > 0 ? 'yellow' : 'dimmed'}>
          {lastExportText}
        </Text>

        <Group gap="xs">
          <Button size="xs" onClick={shareSupported ? exportWithShare : exportDownload}>
            Export backup
          </Button>
          {shareSupported ? (
            <Button size="xs" variant="default" onClick={exportDownload}>
              Download file
            </Button>
          ) : null}
          <FileButton onChange={backupImport.choose} accept="application/json,.json">
            {(props) => (
              <Button size="xs" variant="default" {...props}>
                Import backup
              </Button>
            )}
          </FileButton>
        </Group>

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
