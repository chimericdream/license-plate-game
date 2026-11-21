import {
  Anchor,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useState } from 'react';
import { COUNTRIES, regionsFor } from '../data/regions';
import { isoWithOffset, toLocalInputValue, withWallClock } from '../domain/time';
import type { GeoFix, Sighting } from '../domain/types';
import { appStore, locationService } from '../state/instances';

const REGION_OPTIONS = COUNTRIES.map((country) => ({
  group: country.label,
  items: regionsFor(country.id).map((r) => ({ value: r.id, label: `${r.name} (${r.code})` })),
}));

interface Props {
  sighting: Sighting | null;
  readOnly: boolean;
  onClose: () => void;
}

export function SightingEditor({ sighting, readOnly, onClose }: Props) {
  const compact = useMediaQuery('(max-width: 36em)');
  return (
    <Modal
      opened={sighting !== null}
      onClose={onClose}
      title={readOnly ? 'Sighting' : 'Edit sighting'}
      fullScreen={compact}
      centered
    >
      {sighting ? (
        <EditorForm key={sighting.id} sighting={sighting} readOnly={readOnly} onClose={onClose} />
      ) : null}
    </Modal>
  );
}

function parseCoordinate(text: string, limit: number): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && Math.abs(value) <= limit ? value : Number.NaN;
}

function EditorForm({ sighting, readOnly, onClose }: Props & { sighting: Sighting }) {
  const [regionId, setRegionId] = useState<string | null>(sighting.regionId);
  const [when, setWhen] = useState(toLocalInputValue(sighting.seenAt));
  const [note, setNote] = useState(sighting.note);
  const [lat, setLat] = useState(sighting.location ? String(sighting.location.lat) : '');
  const [lng, setLng] = useState(sighting.location ? String(sighting.location.lng) : '');
  const [locating, setLocating] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const latValue = parseCoordinate(lat, 90);
  const lngValue = parseCoordinate(lng, 180);
  const coordinatesBlank = lat.trim() === '' && lng.trim() === '';
  const coordinatesValid =
    coordinatesBlank ||
    (latValue !== null && lngValue !== null && !Number.isNaN(latValue) && !Number.isNaN(lngValue));
  const canSave = !readOnly && regionId !== null && when !== '' && coordinatesValid;

  const useCurrentLocation = async () => {
    setLocating(true);
    const fix = await locationService.requestFix();
    setLocating(false);
    if (fix) {
      setLat(String(fix.lat));
      setLng(String(fix.lng));
    }
  };

  const save = () => {
    if (!canSave || regionId === null) return;

    const original = sighting.location;
    let location: GeoFix | null = null;
    if (!coordinatesBlank && latValue !== null && lngValue !== null) {
      const unchanged = original && original.lat === latValue && original.lng === lngValue;
      location = unchanged
        ? original
        : { lat: latValue, lng: lngValue, accuracy: null, capturedAt: isoWithOffset(new Date()) };
    }

    // A different position makes the old town name wrong; clearing it lets the
    // lookup (if enabled) label the new spot.
    const locationChanged = original?.lat !== location?.lat || original?.lng !== location?.lng;
    const timeUnchanged = when === toLocalInputValue(sighting.seenAt);
    appStore.updateSighting(sighting.id, {
      regionId,
      seenAt: timeUnchanged ? sighting.seenAt : withWallClock(sighting.seenAt, when),
      note: note.trim(),
      location,
      ...(locationChanged ? { place: undefined } : {}),
    });
    onClose();
  };

  const remove = () => {
    appStore.removeSighting(sighting.id);
    onClose();
  };

  const mapUrl =
    sighting.location &&
    `https://www.google.com/maps/search/?api=1&query=${sighting.location.lat},${sighting.location.lng}`;

  return (
    <Stack gap="md">
      <Select
        label="State / province"
        data={REGION_OPTIONS}
        value={regionId}
        onChange={setRegionId}
        searchable
        allowDeselect={false}
        disabled={readOnly}
        comboboxProps={{ withinPortal: true }}
      />
      <TextInput
        label="When (local time where you saw it)"
        type="datetime-local"
        value={when}
        onChange={(event) => setWhen(event.currentTarget.value)}
        disabled={readOnly}
      />

      <Stack gap="xs">
        <Group grow align="flex-start">
          <TextInput
            label="Latitude"
            inputMode="decimal"
            value={lat}
            onChange={(event) => setLat(event.currentTarget.value)}
            error={latValue !== null && Number.isNaN(latValue) ? 'Between -90 and 90' : undefined}
            disabled={readOnly}
          />
          <TextInput
            label="Longitude"
            inputMode="decimal"
            value={lng}
            onChange={(event) => setLng(event.currentTarget.value)}
            error={lngValue !== null && Number.isNaN(lngValue) ? 'Between -180 and 180' : undefined}
            disabled={readOnly}
          />
        </Group>
        {!coordinatesBlank && (latValue === null || lngValue === null) ? (
          <Text size="xs" c="red">
            Enter both latitude and longitude, or clear both.
          </Text>
        ) : null}
        {sighting.place ? (
          <Text size="xs" c="dimmed">
            Near {sighting.place}
          </Text>
        ) : null}
        {sighting.location?.accuracy != null ? (
          <Text size="xs" c="dimmed">
            Original GPS accuracy: about {Math.round(sighting.location.accuracy)} m
          </Text>
        ) : null}
        <Group gap="md">
          {readOnly ? null : (
            <Button size="xs" variant="light" loading={locating} onClick={useCurrentLocation}>
              Use my current location
            </Button>
          )}
          {mapUrl ? (
            <Anchor href={mapUrl} target="_blank" rel="noreferrer" size="sm">
              Open in maps
            </Anchor>
          ) : null}
        </Group>
      </Stack>

      <Textarea
        label="Note"
        autosize
        minRows={2}
        value={note}
        onChange={(event) => setNote(event.currentTarget.value)}
        disabled={readOnly}
      />

      {readOnly ? (
        <Text size="sm" c="dimmed">
          This trip has ended. Reopen it from the Trips tab to make changes.
        </Text>
      ) : (
        <Group justify="space-between" mt="xs">
          {confirmingDelete ? (
            <Group gap="xs">
              <Button color="red" onClick={remove}>
                Confirm delete
              </Button>
              <Button variant="default" onClick={() => setConfirmingDelete(false)}>
                Keep
              </Button>
            </Group>
          ) : (
            <Button color="red" variant="subtle" onClick={() => setConfirmingDelete(true)}>
              Delete
            </Button>
          )}
          <Button onClick={save} disabled={!canSave}>
            Save
          </Button>
        </Group>
      )}
    </Stack>
  );
}
