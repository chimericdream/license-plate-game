import { Button, Group, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { COOLDOWN_MILES, COOLDOWN_MINUTES, type CooldownBlock } from '../domain/cooldown';
import { getRegion } from '../data/regions';
import { appStore, locationService } from '../state/instances';

const TOAST_ID = 'plate-toast';

function describeBlock(block: CooldownBlock): string {
  const minutes = Math.floor(block.minutesAgo);
  const when = minutes < 1 ? 'just now' : `${minutes} min ago`;
  const miles = block.milesAway === null ? null : Math.round(block.milesAway);
  if (block.tooSoon) {
    return miles === null
      ? `Last one was ${when}. Repeats unlock after ${COOLDOWN_MINUTES} min.`
      : `Last one was ${when}, ${miles} mi from here. Repeats unlock after ${COOLDOWN_MINUTES} min and ${COOLDOWN_MILES} mi.`;
  }
  return `Last one was ${when}, only ${miles ?? 0} mi from here. Repeats unlock after ${COOLDOWN_MILES} mi.`;
}

function showToast(args: {
  message: string;
  detail?: string;
  actionLabel: string;
  onAction: () => void;
  color?: string;
}) {
  notifications.clean();
  notifications.show({
    id: TOAST_ID,
    color: args.color,
    autoClose: 6000,
    withBorder: true,
    message: (
      <Group justify="space-between" wrap="nowrap" gap="md">
        <div>
          <Text fw={600}>{args.message}</Text>
          {args.detail ? (
            <Text size="sm" c="dimmed">
              {args.detail}
            </Text>
          ) : null}
        </div>
        <Button
          size="compact-md"
          variant="light"
          onClick={() => {
            notifications.hide(TOAST_ID);
            args.onAction();
          }}
        >
          {args.actionLabel}
        </Button>
      </Group>
    ),
  });
}

/**
 * Logs a plate for the active trip. The sighting is saved immediately with
 * the freshest position we have, and a position is fetched in the background
 * if there wasn't one, so a slow GPS never delays the tap.
 */
export function logPlate(regionId: string, options: { force?: boolean } = {}): void {
  const region = getRegion(regionId);
  if (!region) return;

  const fix = locationService.getFreshFix();
  const result = appStore.logSighting({ regionId, fix, force: options.force });

  if (!result.ok) {
    if (result.reason === 'cooldown') {
      showToast({
        message: `${region.name} already logged`,
        detail: describeBlock(result.block),
        actionLabel: 'Log anyway',
        color: 'yellow',
        onAction: () => logPlate(regionId, { force: true }),
      });
    }
    return;
  }

  navigator.vibrate?.(30);
  const { sighting } = result;

  showToast({
    message: `${region.name} logged`,
    detail: fix ? undefined : 'Waiting for location…',
    actionLabel: 'Undo',
    onAction: () => appStore.removeSighting(sighting.id),
  });

  if (!fix) {
    void locationService.requestFix().then((late) => {
      if (late) appStore.attachLocation(sighting.id, late);
    });
  }
}
