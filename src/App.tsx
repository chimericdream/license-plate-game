import { Container, Stack, Text, Title } from '@mantine/core';

export function App() {
  return (
    <Container size="sm" py="xl">
      <Stack>
        <Title order={1}>Plate Trip</Title>
        <Text c="dimmed">Scaffold is live. Plates grid coming next.</Text>
      </Stack>
    </Container>
  );
}
