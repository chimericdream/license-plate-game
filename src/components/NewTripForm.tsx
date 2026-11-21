import { Button, Container, Stack, Text, TextInput, Title } from '@mantine/core';
import { useState, type FormEvent } from 'react';
import { appStore, locationService } from '../state/instances';

function defaultTripName(): string {
  const month = new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return `Road trip, ${month}`;
}

export function NewTripForm() {
  const [name, setName] = useState(defaultTripName);

  const start = (event: FormEvent) => {
    event.preventDefault();
    // Asking here (a user gesture) means the browser's location prompt shows
    // up now, not in the middle of spotting the first plate.
    locationService.enable();
    appStore.createTrip(name);
  };

  return (
    <Container size="xs" py="xl">
      <form onSubmit={start}>
        <Stack gap="md">
          <Title order={1}>Plate Trip</Title>
          <Text c="dimmed">
            Log the license plates you spot on the road, with when and where you saw each one.
          </Text>
          <TextInput
            label="Name your trip"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            size="md"
          />
          <Text size="sm" c="dimmed">
            When you start, your browser will ask for location access. Coordinates are saved only on
            this device.
          </Text>
          <Button type="submit" size="lg">
            Start trip
          </Button>
        </Stack>
      </form>
    </Container>
  );
}
