import { Alert, Button, Text } from '@mantine/core';
import { locationService } from '../state/instances';
import { useLocationState } from '../state/hooks';

/** Shown only when location isn't flowing yet; renders nothing once it is. */
export function LocationBanner() {
  const { permission } = useLocationState();

  if (permission === 'denied') {
    return (
      <Alert color="yellow" title="Location is blocked">
        <Text size="sm">
          Plates will still be logged, just without coordinates. To turn it on, allow location for
          this site in your browser's settings.
        </Text>
      </Alert>
    );
  }

  if (permission === 'unsupported') {
    return (
      <Alert color="yellow" title="Location isn't available">
        <Text size="sm">This browser can't provide location, so plates are logged without it.</Text>
      </Alert>
    );
  }

  if (permission === 'prompt') {
    return (
      <Alert color="blue" title="Turn on location">
        <Text size="sm" mb="xs">
          Plate Trip records where you spot each plate. Your location stays on this device.
        </Text>
        <Button size="xs" onClick={() => locationService.enable()}>
          Enable location
        </Button>
      </Alert>
    );
  }

  return null;
}

export function gpsStatusLabel(permission: string, watching: boolean, hasFix: boolean): string {
  if (permission === 'granted')
    return hasFix ? 'GPS ready' : watching ? 'Finding GPS…' : 'GPS paused';
  if (permission === 'denied') return 'No location';
  return 'Location off';
}
