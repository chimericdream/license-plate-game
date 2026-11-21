import { Card, Stack, Switch, Text, Title } from '@mantine/core';
import { useAppState, useSettings } from '../state/hooks';
import { settings } from '../state/instances';
import { useOnline } from '../state/useOnline';

export function PreferencesCard() {
  const { data } = useAppState();
  const { lookUpPlaces } = useSettings();
  const online = useOnline();

  const waiting = data.sightings.filter(
    (s) => !s.deletedAt && s.location && s.place === undefined,
  ).length;

  return (
    <Card withBorder padding="md" radius="md">
      <Stack gap="sm">
        <Title order={5}>Preferences</Title>
        <Switch
          label="Look up town names"
          description="Labels each plate with a town, like “Grand Junction, Colorado”. To do that, its coordinates are sent to OpenStreetMap's Nominatim service. Off by default."
          checked={lookUpPlaces}
          onChange={(event) => settings.update({ lookUpPlaces: event.currentTarget.checked })}
        />
        {lookUpPlaces && waiting > 0 ? (
          <Text size="sm" c="dimmed">
            {online
              ? `Looking up ${waiting} ${waiting === 1 ? 'plate' : 'plates'} in the background…`
              : `${waiting} ${waiting === 1 ? 'plate is' : 'plates are'} waiting for a connection.`}
          </Text>
        ) : null}
      </Stack>
    </Card>
  );
}
