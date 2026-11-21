import { Button, Container, Stack, Text, TextInput, Title } from '@mantine/core';
import { useState, type FormEvent } from 'react';
import { defaultTripName, startTrip } from '../actions/startTrip';

/** Full-screen first-run form, shown when no trip has ever been created. */
export function NewTripForm() {
  const [name, setName] = useState(defaultTripName);

  const start = (event: FormEvent) => {
    event.preventDefault();
    startTrip(name);
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
