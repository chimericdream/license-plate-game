import {
  Alert,
  Badge,
  Group,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { useMemo, useState } from 'react';
import { logPlate } from '../actions/logPlate';
import { COUNTRIES, REGIONS, regionsFor, searchRegions, type Country } from '../data/regions';
import type { Trip } from '../domain/types';
import { useAppState, useLocationState } from '../state/hooks';
import { countByRegion, selectTripSightings } from '../state/selectors';
import { gpsStatusLabel, LocationBanner } from './LocationBanner';
import classes from './PlatesScreen.module.css';
import { RegionTile } from './RegionTile';

export function PlatesScreen({ trip }: { trip: Trip }) {
  const { data, error } = useAppState();
  const location = useLocationState();
  const [country, setCountry] = useLocalStorage<Country>({
    key: 'plate-trip:ui:country',
    defaultValue: 'US',
  });
  const [query, setQuery] = useState('');

  const counts = useMemo(() => countByRegion(selectTripSightings(data, trip.id)), [data, trip.id]);

  const searching = query.trim().length > 0;
  const visible = useMemo(
    () => (searching ? searchRegions(query) : regionsFor(country)),
    [searching, query, country],
  );

  const foundIn = (c: Country) => regionsFor(c).filter((r) => counts.has(r.id)).length;
  const foundTotal = REGIONS.filter((r) => counts.has(r.id)).length;

  const segments = COUNTRIES.map((c) => ({
    value: c.id,
    label: `${c.label} ${foundIn(c.id)}/${regionsFor(c.id).length}`,
  }));

  const gpsLabel = gpsStatusLabel(location.permission, location.watching, location.fix !== null);
  const gpsColor = location.permission === 'granted' && location.fix ? 'green' : 'gray';

  return (
    <div className={classes.shell}>
      <header className={classes.header}>
        <Stack className={classes.inner} gap="xs">
          <Group justify="space-between" wrap="nowrap" gap="xs">
            <div style={{ minWidth: 0 }}>
              <Title order={4} lineClamp={1}>
                {trip.name}
              </Title>
              <Text size="xs" c="dimmed">
                {foundTotal} of {REGIONS.length} found
              </Text>
            </div>
            <Badge color={gpsColor} variant="light" style={{ flexShrink: 0 }}>
              {gpsLabel}
            </Badge>
          </Group>
          {searching ? null : (
            <SegmentedControl
              fullWidth
              data={segments}
              value={country}
              onChange={(value) => setCountry(value as Country)}
            />
          )}
          <TextInput
            placeholder="Search states and provinces"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            aria-label="Search"
            inputMode="search"
            enterKeyHint="search"
          />
        </Stack>
      </header>

      <main className={classes.inner}>
        <Stack gap="sm" pt="sm">
          {error ? (
            <Alert color="red" title="Something went wrong">
              {error}
            </Alert>
          ) : null}
          <LocationBanner />
        </Stack>

        {visible.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            No match for “{query.trim()}”.
          </Text>
        ) : (
          <div className={classes.grid}>
            {visible.map((region) => (
              <RegionTile
                key={region.id}
                region={region}
                count={counts.get(region.id) ?? 0}
                onTap={logPlate}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
