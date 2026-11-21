import { Button, Group, Loader, Modal, Stack, Text, TextInput } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { type FormEvent, Suspense, lazy, useRef, useState } from 'react';
import { searchPlaces, type PlaceMatch } from '../location/forwardGeocode';
import { locationService } from '../state/instances';
import { useOnline } from '../state/useOnline';
import type { JumpTo, LatLng } from './LocationPickerMap';

// Leaflet is only fetched when someone opens the picker.
const LocationPickerMap = lazy(() => import('./LocationPickerMap'));

interface Props {
  opened: boolean;
  /** The sighting's current position, if it has one. */
  initial: LatLng | null;
  /** Short label for the pin, such as the state code. */
  code: string;
  onClose: () => void;
  onConfirm: (point: LatLng) => void;
}

export function LocationPickerModal({ opened, initial, code, onClose, onConfirm }: Props) {
  const compact = useMediaQuery('(max-width: 36em)');
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Choose the spot"
      fullScreen={compact}
      centered
      zIndex={400}
    >
      {opened ? (
        <Picker initial={initial} code={code} onClose={onClose} onConfirm={onConfirm} />
      ) : null}
    </Modal>
  );
}

type SearchState =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'results'; query: string; matches: PlaceMatch[] }
  | { kind: 'error'; message: string };

function Picker({ initial, code, onClose, onConfirm }: Omit<Props, 'opened'>) {
  const online = useOnline();
  const [picked, setPicked] = useState<LatLng | null>(initial);
  const [jumpTo, setJumpTo] = useState<JumpTo | null>(null);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<SearchState>({ kind: 'idle' });
  // Only the newest search may update the screen.
  const searchId = useRef(0);
  // Where to look if there's no pin yet: the last position the phone reported.
  const [center] = useState(() => locationService.getSnapshot().fix);

  const runSearch = async (event: FormEvent) => {
    event.preventDefault();
    const text = query.trim();
    if (text === '') return;
    const id = ++searchId.current;
    setSearch({ kind: 'searching' });
    try {
      const matches = await searchPlaces(text);
      if (id === searchId.current) setSearch({ kind: 'results', query: text, matches });
    } catch {
      if (id === searchId.current) {
        setSearch({
          kind: 'error',
          message: "Couldn't search just now. Check your connection, or tap the map instead.",
        });
      }
    }
  };

  const choosePlace = (match: PlaceMatch) => {
    setJumpTo((previous) => ({ lat: match.lat, lng: match.lng, seq: (previous?.seq ?? 0) + 1 }));
    setQuery(match.label);
    setSearch({ kind: 'idle' });
  };

  return (
    <Stack gap="sm">
      <form onSubmit={runSearch}>
        <Group gap="xs" align="flex-end" wrap="nowrap">
          <TextInput
            style={{ flex: 1 }}
            label="Search for a town"
            placeholder="City and state, e.g. Moab, UT"
            value={query}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              if (search.kind !== 'idle') setSearch({ kind: 'idle' });
            }}
            enterKeyHint="search"
            autoComplete="off"
          />
          <Button
            type="submit"
            variant="light"
            loading={search.kind === 'searching'}
            disabled={query.trim() === '' || !online}
          >
            Search
          </Button>
        </Group>
      </form>
      <Text size="xs" c="dimmed">
        Searching sends what you type to OpenStreetMap. Tapping the map doesn't.
      </Text>
      {search.kind === 'error' ? (
        <Text size="sm" c="red" role="alert">
          {search.message}
        </Text>
      ) : null}
      {search.kind === 'results' ? (
        search.matches.length === 0 ? (
          <Text size="sm" role="status">
            Nothing found for "{search.query}". Try a nearby town, or add the state.
          </Text>
        ) : (
          <Stack gap={4} role="list" aria-label="Search results">
            {search.matches.map((match) => (
              <Button
                key={match.id}
                variant="default"
                justify="flex-start"
                role="listitem"
                onClick={() => choosePlace(match)}
              >
                {match.label}
              </Button>
            ))}
          </Stack>
        )
      ) : null}
      <Text size="sm" c="dimmed">
        {initial
          ? 'Tap the map to move the pin, or drag it to fine-tune.'
          : 'Tap the map where you saw it. You can drag the pin to fine-tune.'}
      </Text>
      <Suspense
        fallback={
          <Group justify="center" py="xl">
            <Loader />
          </Group>
        }
      >
        <LocationPickerMap
          initial={initial}
          center={center}
          code={code}
          jumpTo={jumpTo}
          onPick={setPicked}
        />
      </Suspense>
      {!online ? (
        <Text size="xs" c="yellow">
          You're offline, so search is unavailable and the map may be blank where you haven't looked
          before. You can still tap to choose a spot.
        </Text>
      ) : null}
      <Text size="sm" c={picked ? undefined : 'dimmed'}>
        {picked ? `${picked.lat.toFixed(5)}, ${picked.lng.toFixed(5)}` : 'No spot chosen yet.'}
      </Text>
      <Group justify="flex-end" gap="xs">
        <Button variant="default" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={!picked} onClick={() => picked && onConfirm(picked)}>
          Use this spot
        </Button>
      </Group>
    </Stack>
  );
}
