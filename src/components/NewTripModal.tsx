import { Button, Modal, Stack, Text, TextInput } from '@mantine/core';
import { useState, type FormEvent } from 'react';
import { defaultTripName, startTrip } from '../actions/startTrip';

interface Props {
  opened: boolean;
  onClose: () => void;
  /** Called after the trip has been created. */
  onStarted?: () => void;
}

export function NewTripModal({ opened, onClose, onStarted }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title="Start a new trip" centered>
      {opened ? <NewTripFields onClose={onClose} onStarted={onStarted} /> : null}
    </Modal>
  );
}

function NewTripFields({ onClose, onStarted }: Omit<Props, 'opened'>) {
  const [name, setName] = useState(defaultTripName);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    startTrip(name);
    onClose();
    onStarted?.();
  };

  return (
    <form onSubmit={submit}>
      <Stack gap="md">
        <TextInput
          label="Trip name"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          data-autofocus
        />
        <Text size="sm" c="dimmed">
          Starting a new trip ends the current one. Nothing is deleted, and you can reopen it later.
        </Text>
        <Button type="submit">Start trip</Button>
      </Stack>
    </form>
  );
}
