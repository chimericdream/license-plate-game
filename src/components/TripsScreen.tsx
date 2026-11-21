import { Badge, Button, Card, Group, Modal, Stack, Text, TextInput, Title } from '@mantine/core';
import { useMemo, useState, type FormEvent } from 'react';
import { formatDate, wallClock } from '../domain/time';
import type { Trip } from '../domain/types';
import { useAppState } from '../state/hooks';
import { appStore } from '../state/instances';
import { selectTripSightings, selectTrips } from '../state/selectors';
import { DataBackupCard } from './DataBackupCard';
import { NewTripModal } from './NewTripModal';
import screen from './Screen.module.css';

export function TripsScreen() {
  const { data } = useAppState();
  const trips = selectTrips(data);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const result = new Map<string, { plates: number; regions: number }>();
    for (const trip of data.trips) {
      const sightings = selectTripSightings(data, trip.id);
      result.set(trip.id, {
        plates: sightings.length,
        regions: new Set(sightings.map((s) => s.regionId)).size,
      });
    }
    return result;
  }, [data]);

  const editing = trips.find((t) => t.id === editingId) ?? null;

  return (
    <div className={screen.shell}>
      <header className={screen.header}>
        <Group className={screen.inner} justify="space-between">
          <Title order={4}>Trips</Title>
          <Button size="xs" onClick={() => setCreating(true)}>
            New trip
          </Button>
        </Group>
      </header>

      <main className={screen.inner}>
        <div className={screen.list}>
          {trips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              active={trip.id === data.activeTripId}
              plates={stats.get(trip.id)?.plates ?? 0}
              regions={stats.get(trip.id)?.regions ?? 0}
              onEdit={() => setEditingId(trip.id)}
            />
          ))}
          <DataBackupCard />
        </div>
      </main>

      <NewTripModal opened={creating} onClose={() => setCreating(false)} />
      <TripEditor trip={editing} onClose={() => setEditingId(null)} />
    </div>
  );
}

interface CardProps {
  trip: Trip;
  active: boolean;
  plates: number;
  regions: number;
  onEdit: () => void;
}

function TripCard({ trip, active, plates, regions, onEdit }: CardProps) {
  const start = formatDate(wallClock(trip.startedAt).date);
  const end = trip.endedAt ? formatDate(wallClock(trip.endedAt).date) : null;

  return (
    <Card withBorder padding="md" radius="md">
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <div style={{ minWidth: 0 }}>
            <Text fw={700} truncate>
              {trip.name}
            </Text>
            <Text size="sm" c="dimmed">
              {end && end !== start ? `${start} to ${end}` : start}
            </Text>
          </div>
          <Badge color={active ? 'green' : 'gray'} variant="light" style={{ flexShrink: 0 }}>
            {active ? 'Active' : 'Ended'}
          </Badge>
        </Group>
        <Text size="sm">
          {plates} {plates === 1 ? 'plate' : 'plates'} · {regions}{' '}
          {regions === 1 ? 'state/province' : 'states/provinces'}
        </Text>
        <Group gap="xs">
          {active ? (
            <Button size="xs" variant="light" onClick={() => appStore.endTrip(trip.id)}>
              End trip
            </Button>
          ) : (
            <Button size="xs" variant="light" onClick={() => appStore.reopenTrip(trip.id)}>
              Reopen
            </Button>
          )}
          <Button size="xs" variant="default" onClick={onEdit}>
            Rename or delete
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

function TripEditor({ trip, onClose }: { trip: Trip | null; onClose: () => void }) {
  return (
    <Modal opened={trip !== null} onClose={onClose} title="Edit trip" centered>
      {trip ? <TripEditorForm key={trip.id} trip={trip} onClose={onClose} /> : null}
    </Modal>
  );
}

function TripEditorForm({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const [name, setName] = useState(trip.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    appStore.renameTrip(trip.id, name);
    onClose();
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
        <Group justify="space-between">
          {confirmingDelete ? (
            <Stack gap={4}>
              <Text size="xs" c="red">
                Deletes this trip and all its plates.
              </Text>
              <Group gap="xs">
                <Button
                  color="red"
                  onClick={() => {
                    appStore.deleteTrip(trip.id);
                    onClose();
                  }}
                >
                  Confirm delete
                </Button>
                <Button variant="default" onClick={() => setConfirmingDelete(false)}>
                  Keep
                </Button>
              </Group>
            </Stack>
          ) : (
            <Button color="red" variant="subtle" onClick={() => setConfirmingDelete(true)}>
              Delete trip
            </Button>
          )}
          <Button type="submit" disabled={name.trim() === ''}>
            Save
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
