import { Select, Text } from '@mantine/core';
import { useAppState } from '../state/hooks';
import { selectTrips, selectViewedTrip } from '../state/selectors';

interface Props {
  pickedId: string | null;
  onPick: (id: string) => void;
}

/** Chooses which trip the Timeline and Stats tabs show; plain text when there's only one. */
export function TripPicker({ pickedId, onPick }: Props) {
  const { data } = useAppState();
  const trips = selectTrips(data);
  const trip = selectViewedTrip(data, pickedId);

  if (trips.length > 1) {
    return (
      <Select
        aria-label="Trip"
        data={trips.map((t) => ({
          value: t.id,
          label: t.id === data.activeTripId ? `${t.name} (active)` : t.name,
        }))}
        value={trip?.id ?? null}
        onChange={(value) => value && onPick(value)}
        allowDeselect={false}
      />
    );
  }
  return trip ? (
    <Text size="sm" c="dimmed">
      {trip.name}
    </Text>
  ) : null;
}
