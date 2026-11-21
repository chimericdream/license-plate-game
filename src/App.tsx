import { Alert, Center, Container, Loader } from '@mantine/core';
import { useEffect, useState } from 'react';
import classes from './components/AppShell.module.css';
import { BottomNav, type Tab } from './components/BottomNav';
import { NewTripForm } from './components/NewTripForm';
import { NoActiveTrip } from './components/NoActiveTrip';
import { PlatesScreen } from './components/PlatesScreen';
import { StatsScreen } from './components/StatsScreen';
import { TimelineScreen } from './components/TimelineScreen';
import { TripsScreen } from './components/TripsScreen';
import { useAppState } from './state/hooks';
import { appStore, locationService } from './state/instances';
import { selectActiveTrip, selectTrips } from './state/selectors';
import { requestPersistentStorage } from './storage/persistence';

export function App() {
  const { status, data, error } = useAppState();
  const [tab, setTab] = useState<Tab>('plates');
  // Which trip the Timeline and Stats tabs show; null follows the active trip.
  const [viewTripId, setViewTripId] = useState<string | null>(null);

  useEffect(() => {
    void appStore.init();
    void locationService.init();
    void requestPersistentStorage();
  }, []);

  // Once a trip exists, ask for location on our own at launch and on every
  // return to the app, so there's no banner to tap after leaving and coming back.
  const hasTrips = status === 'ready' && selectTrips(data).length > 0;
  useEffect(() => {
    if (hasTrips) locationService.arm();
  }, [hasTrips]);

  if (status === 'loading') {
    return (
      <Center h="100dvh">
        <Loader />
      </Center>
    );
  }

  if (status === 'error') {
    return (
      <Container size="xs" py="xl">
        <Alert color="red" title="Couldn't load your data">
          {error}
        </Alert>
      </Container>
    );
  }

  // First run: nothing exists yet, so go straight to naming a trip.
  if (selectTrips(data).length === 0) return <NewTripForm />;

  const activeTrip = selectActiveTrip(data);
  return (
    <>
      <div className={classes.content}>
        {tab === 'plates' ? (
          activeTrip ? (
            <PlatesScreen trip={activeTrip} />
          ) : (
            <NoActiveTrip />
          )
        ) : null}
        {tab === 'timeline' ? (
          <TimelineScreen pickedId={viewTripId} onPick={setViewTripId} />
        ) : null}
        {tab === 'stats' ? <StatsScreen pickedId={viewTripId} onPick={setViewTripId} /> : null}
        {tab === 'trips' ? <TripsScreen onOpenPlates={() => setTab('plates')} /> : null}
      </div>
      <BottomNav tab={tab} onChange={setTab} />
    </>
  );
}
