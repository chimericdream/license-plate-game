import { Group, Select, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { getRegion } from '../data/regions';
import { formatDay, formatTime, wallClock } from '../domain/time';
import type { Sighting } from '../domain/types';
import { useAppState } from '../state/hooks';
import { selectTripSightings, selectTrips } from '../state/selectors';
import { SightingEditor } from './SightingEditor';
import screen from './Screen.module.css';
import classes from './TimelineScreen.module.css';

function groupByDay(sightings: Sighting[]): { date: string; items: Sighting[] }[] {
  const groups = new Map<string, Sighting[]>();
  for (const s of sightings) {
    const { date } = wallClock(s.seenAt);
    const list = groups.get(date);
    if (list) list.push(s);
    else groups.set(date, [s]);
  }
  return [...groups].map(([date, items]) => ({ date, items }));
}

export function TimelineScreen() {
  const { data } = useAppState();
  const trips = selectTrips(data);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const trip =
    trips.find((t) => t.id === pickedId) ??
    trips.find((t) => t.id === data.activeTripId) ??
    trips[0];

  const sightings = trip
    ? selectTripSightings(data, trip.id).toSorted(
        (a, b) => Date.parse(b.seenAt) - Date.parse(a.seenAt),
      )
    : [];
  const days = groupByDay(sightings);
  const editing = sightings.find((s) => s.id === editingId) ?? null;
  const readOnly = !trip || trip.endedAt !== null;

  return (
    <div className={screen.shell}>
      <header className={screen.header}>
        <Stack className={screen.inner} gap="xs">
          <Title order={4}>Timeline</Title>
          {trips.length > 1 ? (
            <Select
              aria-label="Trip"
              data={trips.map((t) => ({
                value: t.id,
                label: t.id === data.activeTripId ? `${t.name} (active)` : t.name,
              }))}
              value={trip?.id ?? null}
              onChange={(value) => setPickedId(value)}
              allowDeselect={false}
            />
          ) : trip ? (
            <Text size="sm" c="dimmed">
              {trip.name}
            </Text>
          ) : null}
        </Stack>
      </header>

      <main className={screen.inner}>
        <div className={screen.list}>
          {sightings.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">
              No plates logged on this trip yet.
            </Text>
          ) : (
            days.map((day) => (
              <Stack key={day.date} gap="xs">
                <div className={classes.day}>{formatDay(day.date)}</div>
                {day.items.map((s) => (
                  <SightingRow key={s.id} sighting={s} onOpen={() => setEditingId(s.id)} />
                ))}
              </Stack>
            ))
          )}
        </div>
      </main>

      <SightingEditor sighting={editing} readOnly={readOnly} onClose={() => setEditingId(null)} />
    </div>
  );
}

function SightingRow({ sighting, onOpen }: { sighting: Sighting; onOpen: () => void }) {
  const region = getRegion(sighting.regionId);
  const { time } = wallClock(sighting.seenAt);
  const { location } = sighting;

  return (
    <button type="button" className={classes.row} onClick={onOpen}>
      <span className={classes.code}>{region?.code ?? '?'}</span>
      <span className={classes.body}>
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Text fw={600} truncate>
            {region?.name ?? sighting.regionId}
          </Text>
          <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
            {formatTime(time)}
          </Text>
        </Group>
        <Text size="xs" c={location ? 'dimmed' : 'yellow'}>
          {location
            ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`
            : 'No location recorded'}
        </Text>
        {sighting.note ? (
          <Text size="sm" lineClamp={1}>
            {sighting.note}
          </Text>
        ) : null}
      </span>
    </button>
  );
}
