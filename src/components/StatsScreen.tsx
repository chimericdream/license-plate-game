import { Accordion, Badge, Group, Progress, Stack, Text, Title } from '@mantine/core';
import { getRegion } from '../data/regions';
import { computeTripStats } from '../domain/stats';
import { formatDay, formatDayShort, formatDuration, formatTime, wallClock } from '../domain/time';
import { useAppState } from '../state/hooks';
import { selectTripSightings, selectViewedTrip } from '../state/selectors';
import { BarChart, type Bar } from './charts/BarChart';
import { StepChart, type StepPoint } from './charts/StepChart';
import screen from './Screen.module.css';
import classes from './StatsScreen.module.css';
import { TripPicker } from './TripPicker';

interface Props {
  pickedId: string | null;
  onPick: (id: string) => void;
}

function momentLabel(iso: string): string {
  const { date, time } = wallClock(iso);
  return `${formatDayShort(date)}, ${formatTime(time)}`;
}

export function StatsScreen({ pickedId, onPick }: Props) {
  const { data } = useAppState();
  const trip = selectViewedTrip(data, pickedId);
  const stats = computeTripStats(trip ? selectTripSightings(data, trip.id) : []);

  const discoveryPoints: StepPoint[] = stats.discoveries.map((d) => ({
    x: d.at,
    y: d.count,
    label: `${getRegion(d.regionId)?.name ?? d.regionId} · ${momentLabel(d.seenAt)}`,
  }));
  const firstDiscovery = stats.discoveries[0];
  const lastDiscovery = stats.discoveries.at(-1);

  const dayBars: Bar[] = stats.perDay.map((day) => ({
    key: day.date,
    value: day.plates,
    axisLabel: formatDayShort(day.date),
    label: `${formatDay(day.date)}${day.newRegions ? `, ${day.newRegions} new` : ''}`,
  }));

  const hasPlates = stats.plates > 0;
  const miles = stats.located >= 2 ? `${Math.round(stats.approxMiles).toLocaleString()} mi` : '—';

  return (
    <div className={screen.shell}>
      <header className={screen.header}>
        <Stack className={screen.inner} gap="xs">
          <Title order={4}>Stats</Title>
          <TripPicker pickedId={pickedId} onPick={onPick} />
        </Stack>
      </header>

      <main className={screen.inner}>
        <div className={screen.list}>
          <div className={classes.tiles}>
            <Tile
              value={`${stats.regionsFound} / ${stats.regionsTotal}`}
              caption="States & provinces"
            />
            <Tile
              value={String(stats.plates)}
              caption={stats.plates === 1 ? 'Plate spotted' : 'Plates spotted'}
            />
            <Tile value={miles} caption="Approx. distance between sightings" />
            <Tile
              value={stats.spanMinutes === null ? '—' : formatDuration(stats.spanMinutes)}
              caption="First to last plate"
            />
          </div>

          <section className={classes.section}>
            <Title order={5} mb="xs">
              Progress
            </Title>
            <Stack gap="sm">
              {stats.byCountry.map((c) => (
                <div key={c.country}>
                  <Group justify="space-between" mb={4}>
                    <Text size="sm">{c.label}</Text>
                    <Text size="sm" c="dimmed">
                      {c.found} of {c.total}
                    </Text>
                  </Group>
                  <Progress
                    value={(c.found / c.total) * 100}
                    aria-label={`${c.label}: ${c.found} of ${c.total}`}
                    radius="xl"
                  />
                </div>
              ))}
            </Stack>
          </section>

          {hasPlates ? (
            <>
              <section className={classes.section}>
                <Title order={5} mb={2}>
                  New states and provinces over time
                </Title>
                <Text size="sm" c="dimmed" mb="xs">
                  {stats.minutesPerNewRegion === null
                    ? 'Each step up is a new one.'
                    : `About one new one every ${formatDuration(stats.minutesPerNewRegion)}.`}
                </Text>
                <div className={classes.chart}>
                  <StepChart
                    points={discoveryPoints}
                    ariaLabel="Cumulative states and provinces found over time"
                    startLabel={firstDiscovery ? momentLabel(firstDiscovery.seenAt) : ''}
                    endLabel={
                      lastDiscovery && discoveryPoints.length > 1
                        ? momentLabel(lastDiscovery.seenAt)
                        : ''
                    }
                    formatValue={(y) => `${y} found`}
                    columns={['When', 'Found so far']}
                  />
                </div>
              </section>

              {dayBars.length > 1 ? (
                <section className={classes.section}>
                  <Title order={5} mb="xs">
                    Plates per day
                  </Title>
                  <div className={classes.chart}>
                    <BarChart
                      bars={dayBars}
                      ariaLabel="Plates spotted per day"
                      formatValue={(v) => `${v} ${v === 1 ? 'plate' : 'plates'}`}
                      columns={['Day', 'Plates']}
                    />
                  </div>
                </section>
              ) : null}

              {stats.repeats.length > 0 ? (
                <section className={classes.section}>
                  <Title order={5} mb="xs">
                    Seen more than once
                  </Title>
                  <Group gap="xs">
                    {stats.repeats.slice(0, 12).map(({ region, count }) => (
                      <Badge key={region.id} variant="light" size="lg">
                        {region.code} × {count}
                      </Badge>
                    ))}
                  </Group>
                </section>
              ) : null}
            </>
          ) : (
            <Text c="dimmed" ta="center" py="md">
              Log some plates and the charts will show up here.
            </Text>
          )}

          <section className={classes.section}>
            <Title order={5} mb="xs">
              Still looking for
            </Title>
            <Accordion multiple defaultValue={['US']} variant="separated">
              {stats.byCountry.map((c) => {
                const missing = stats.missing.filter((r) => r.country === c.country);
                return (
                  <Accordion.Item key={c.country} value={c.country}>
                    <Accordion.Control>
                      {c.label} ({missing.length} left)
                    </Accordion.Control>
                    <Accordion.Panel>
                      {missing.length === 0 ? (
                        <Text size="sm">You've found them all. 🎉</Text>
                      ) : (
                        <Group gap={6}>
                          {missing.map((r) => (
                            <Badge key={r.id} variant="outline" color="gray" size="lg" fw={500}>
                              {r.name}
                            </Badge>
                          ))}
                        </Group>
                      )}
                    </Accordion.Panel>
                  </Accordion.Item>
                );
              })}
            </Accordion>
          </section>
        </div>
      </main>
    </div>
  );
}

function Tile({ value, caption }: { value: string; caption: string }) {
  return (
    <div className={classes.tile}>
      <div className={classes.value}>{value}</div>
      <div className={classes.caption}>{caption}</div>
    </div>
  );
}
