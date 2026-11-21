import {
  Alert,
  Button,
  Container,
  Divider,
  FileButton,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useState, type FormEvent } from 'react';
import { defaultTripName, startTrip } from '../actions/startTrip';
import { ImportModal } from './ImportModal';
import { BACKUP_FILE_TYPES, useBackupImport } from './useBackupImport';

/** Full-screen first-run form, shown when no trip has ever been created. */
export function NewTripForm() {
  const [name, setName] = useState(defaultTripName);
  const backupImport = useBackupImport();

  const start = (event: FormEvent) => {
    event.preventDefault();
    startTrip(name);
  };

  return (
    <Container size="xs" py="xl">
      <Stack gap="md">
        <Title order={1}>Plate Trip</Title>
        <Text c="dimmed">
          Log the license plates you spot on the road, with when and where you saw each one.
        </Text>

        <form onSubmit={start}>
          <Stack gap="md">
            <TextInput
              label="Name your trip"
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              size="md"
            />
            <Text size="sm" c="dimmed">
              When you start, your browser will ask for location access. Coordinates are saved on
              this device. Only the map view (which loads OpenStreetMap tiles) and the optional town
              lookup in Trips contact an outside service.
            </Text>
            <Button type="submit" size="lg">
              Start trip
            </Button>
          </Stack>
        </form>

        <Divider label="or" labelPosition="center" />

        <FileButton onChange={backupImport.choose} accept={BACKUP_FILE_TYPES}>
          {(props) => (
            <Button variant="default" {...props}>
              Restore from a backup
            </Button>
          )}
        </FileButton>
        {backupImport.error ? (
          <Alert color="red" title="Couldn't import that file">
            {backupImport.error}
          </Alert>
        ) : null}
      </Stack>

      <ImportModal backup={backupImport.pending} onClose={backupImport.close} />
    </Container>
  );
}
