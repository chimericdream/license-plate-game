import { notifications } from '@mantine/notifications';
import type { Trip } from '../domain/types';
import { appStore } from '../state/instances';
import { selectTripSightings } from '../state/selectors';
import { exportFilename, tripToCsv, tripToGpx } from '../storage/exportTrip';
import { downloadTextFile } from '../storage/exportFile';

export type TripExportKind = 'csv' | 'gpx';

/** Builds a CSV or GPX file for a trip and saves it to the device's downloads. */
export function exportTrip(trip: Trip, kind: TripExportKind): void {
  const sightings = selectTripSightings(appStore.getSnapshot().data, trip.id);
  const filename = exportFilename(trip, kind);
  if (kind === 'csv') {
    downloadTextFile(filename, tripToCsv(trip, sightings), 'text/csv;charset=utf-8');
  } else {
    downloadTextFile(filename, tripToGpx(trip, sightings), 'application/gpx+xml');
  }
  notifications.show({ message: `Saved ${filename} to your downloads.`, color: 'green' });
}
