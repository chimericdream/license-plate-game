import { Button, Group, Loader, Paper, SegmentedControl, Stack, Text, Title } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { Suspense, lazy, useState } from 'react';
import { getRegion } from '../data/regions';
import { formatDay, formatTime, wallClock } from '../domain/time';
import type { Sighting } from '../domain/types';
import { useAppState } from '../state/hooks';
import { selectTripSightings, selectViewedTrip } from '../state/selectors';
import { useOnline } from '../state/useOnline';
import { SightingEditor } from './SightingEditor';
import screen from './Screen.module.css';
import classes from './TimelineScreen.module.css';
import { TripPicker } from './TripPicker';

// Leaflet is only fetched when the Map view is opened.
const SightingsMap = lazy(() => import('./SightingsMap'));

type View = 'list' | 'map';

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

interface Props {
  pickedId: string | null;
  onPick: (id: string) => void;
}

export function TimelineScreen({ pickedId, onPick }: Props) {
  const { data } = useAppState();
  const trip = selectViewedTrip(data, pickedId);
  const [view, setView] = useLocalStorage<View>({
    key: 'plate-trip:ui:timeline-view',
    defaultValue: 'list',
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sightings = trip
    ? selectTripSightings(data, trip.id).toSorted(
        (a, b) => Date.parse(b.seenAt) - Date.parse(a.seenAt),
      )
    : [];
  const days = groupByDay(sightings);
  const editing = sightings.find((s) => s.id === editingId) ?? null;
  const selected = sightings.find((s) => s.id === selectedId) ?? null;
  const readOnly = !trip || trip.endedAt !== null;

  return (
    <div className={screen.shell}>
      <header className={screen.header}>
        <Stack className={screen.inner} gap="xs">
          <Title order={4}>Timeline</Title>
          <TripPicker pickedId={pickedId} onPick={onPick} />
          <SegmentedControl
            fullWidth
            data={[
              { value: 'list', label: 'List' },
              { value: 'map', label: 'Map' },
            ]}
            value={view}
            onChange={(value) => setView(value as View)}
          />
        </Stack>
      </header>

      <main className={screen.inner}>
        <div className={screen.list}>
          {sightings.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">
              No plates logged on this trip yet.
            </Text>
          ) : view === 'map' ? (
            <MapView
              sightings={sightings}
              selected={selected}
              onSelect={setSelectedId}
              onEdit={() => selected && setEditingId(selected.id)}
            />
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

interface MapViewProps {
  sightings: Sighting[];
  selected: Sighting | null;
  onSelect: (id: string) => void;
  onEdit: () => void;
}

function MapView({ sightings, selected, onSelect, onEdit }: MapViewProps) {
  const online = useOnline();
  const missing = sightings.filter((s) => s.location === null).length;
  const hasPins = missing < sightings.length;

  if (!hasPins) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        None of this trip's plates have a location yet, so there's nothing to put on the map. You
        can add coordinates from the List view.
      </Text>
    );
  }

  const region = selected ? getRegion(selected.regionId) : undefined;
  const when = selected ? wallClock(selected.seenAt) : null;

  return (
    <Stack gap="xs">
      <Suspense
        fallback={
          <Group justify="center" py="xl">
            <Loader />
          </Group>
        }
      >
        <SightingsMap sightings={sightings} selectedId={selected?.id ?? null} onSelect={onSelect} />
      </Suspense>

      {!online ? (
        <Text size="xs" c="yellow">
          You're offline. Map tiles you haven't viewed before won't load, but your pins still show.
        </Text>
      ) : null}
      {missing > 0 ? (
        <Text size="xs" c="dimmed">
          {missing} {missing === 1 ? 'plate has' : 'plates have'} no location and{' '}
          {missing === 1 ? "isn't" : "aren't"} shown.
        </Text>
      ) : null}

      {selected && when ? (
        <Paper withBorder p="sm" radius="md">
          <Group justify="space-between" wrap="nowrap">
            <div style={{ minWidth: 0 }}>
              <Text fw={600} truncate>
                {region?.name ?? selected.regionId}
              </Text>
              <Text size="sm" c="dimmed">
                {formatDay(when.date)}, {formatTime(when.time)}
              </Text>
              {selected.place ? (
                <Text size="sm" c="dimmed">
                  Near {selected.place}
                </Text>
              ) : null}
              {selected.note ? (
                <Text size="sm" lineClamp={2}>
                  {selected.note}
                </Text>
              ) : null}
            </div>
            <Button size="xs" variant="light" onClick={onEdit}>
              Details
            </Button>
          </Group>
        </Paper>
      ) : (
        <Text size="sm" c="dimmed">
          Tap a pin to see that sighting. The dashed line joins them in the order you saw them.
        </Text>
      )}
    </Stack>
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
            ? (sighting.place ?? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`)
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
