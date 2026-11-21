import { Button, Container, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { useAppState } from '../state/hooks';
import { appStore } from '../state/instances';
import { selectTrips } from '../state/selectors';
import { NewTripModal } from './NewTripModal';

/** Plates tab content when every trip has been ended. */
export function NoActiveTrip() {
  const { data } = useAppState();
  const [creating, setCreating] = useState(false);
  const latest = selectTrips(data)[0];

  return (
    <Container size="xs" py="xl">
      <Stack gap="md" align="stretch">
        <Title order={3}>No active trip</Title>
        <Text c="dimmed">Start a new trip, or pick up where you left off.</Text>
        <Button size="lg" onClick={() => setCreating(true)}>
          Start a new trip
        </Button>
        {latest ? (
          <Button size="lg" variant="light" onClick={() => appStore.reopenTrip(latest.id)}>
            Resume “{latest.name}”
          </Button>
        ) : null}
      </Stack>
      <NewTripModal opened={creating} onClose={() => setCreating(false)} />
    </Container>
  );
}
