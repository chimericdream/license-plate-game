import { Alert, Center, Container, Loader } from '@mantine/core';
import { useEffect } from 'react';
import { NewTripForm } from './components/NewTripForm';
import { PlatesScreen } from './components/PlatesScreen';
import { useAppState } from './state/hooks';
import { appStore, locationService } from './state/instances';
import { selectActiveTrip } from './state/selectors';

export function App() {
  const { status, data, error } = useAppState();

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

  const trip = selectActiveTrip(data);
  return trip ? <PlatesScreen trip={trip} /> : <NewTripForm />;
}
