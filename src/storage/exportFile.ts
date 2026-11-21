import { backupFilename, createBackup } from './backup';
import type { StoreData } from '../domain/types';

export type ExportResult = 'shared' | 'downloaded' | 'cancelled';

export function backupFile(data: StoreData, now: Date): File {
  return new File([createBackup(data, now)], backupFilename(now), { type: 'application/json' });
}

/** True when this browser can hand a file to the system share sheet. */
export function canShareBackup(): boolean {
  if (typeof navigator === 'undefined' || !navigator.canShare || !navigator.share) return false;
  return navigator.canShare({
    files: [
      backupFile({ schemaVersion: 1, activeTripId: null, trips: [], sightings: [] }, new Date()),
    ],
  });
}

/** Opens the share sheet (Drive, Files, email, ...) with the file attached. */
export async function shareFile(file: File): Promise<ExportResult> {
  try {
    await navigator.share({ files: [file], title: 'Plate Trip backup' });
    return 'shared';
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    throw error;
  }
}

/** Saves a file straight to the device's downloads. */
export function downloadFile(file: File): ExportResult {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before releasing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'downloaded';
}

/** Saves a text export (CSV, GPX) to the device's downloads. */
export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  downloadFile(new File([content], filename, { type: mimeType }));
}
