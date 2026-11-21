import { Alert, Center, Container, Loader } from '@mantine/core';
import { useEffect, useState } from 'react';
import classes from './components/AppShell.module.css';
import { BottomNav, type Tab } from './components/BottomNav';
import { NewTripForm } from './components/NewTripForm';
import { NoActiveTrip } from './components/NoActiveTrip';
import { PlatesScreen } from './components/PlatesScreen';
import { TimelineScreen } from './components/TimelineScreen';
import { TripsScreen } from './components/TripsScreen';
import { useAppState } from './state/hooks';
import { appStore, locationService } from './state/instances';
import { selectActiveTrip, selectTrips } from './state/selectors';

export function App() {
  const { status, data, error } = useAppState();
  const [tab, setTab] = useState<Tab>('plates');

  useEffect(() => {
    void appStore.init();
    void locationService.init();
  }, []);

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
        {tab === 'timeline' ? <TimelineScreen /> : null}
        {tab === 'trips' ? <TripsScreen /> : null}
      </div>
      <BottomNav tab={tab} onChange={setTab} />
    </>
  );
}
