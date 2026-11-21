import type { Photo, StoreData } from '../domain/types';
import { createBackup, parseBackup } from './backup';
import type { PhotoBlobs } from './db';
import { createZip, looksLikeZip, readZip } from './zip';

const BACKUP_ENTRY = 'backup.json';
const MANIFEST_ENTRY = 'photos.json';
const PHOTOS_FORMAT = 'plate-trip-photos';
const PHOTOS_FORMAT_VERSION = 1;

const fullName = (id: string) => `photos/${id}.jpg`;
const thumbName = (id: string) => `photos/${id}.thumb.jpg`;

/** A photo found in a backup. Its image data is read only when asked for. */
export interface BackupPhoto {
  photo: Photo;
  blobs: () => Promise<PhotoBlobs>;
}

export interface ParsedBackup {
  data: StoreData;
  photos: BackupPhoto[];
}

/**
 * A zip holding the usual backup JSON plus every live photo, so a restore
 * brings the pictures back too.
 */
export async function createBackupZip(
  data: StoreData,
  photos: readonly Photo[],
  getBlobs: (id: string) => Promise<PhotoBlobs | undefined>,
  now: Date,
): Promise<Blob> {
  const entries = [{ name: BACKUP_ENTRY, data: new Blob([createBackup(data, now)]) }];
  const included: Photo[] = [];
  for (const photo of photos) {
    if (photo.deletedAt) continue;
    const blobs = await getBlobs(photo.id);
    if (!blobs) continue;
    included.push(photo);
    entries.push(
      { name: fullName(photo.id), data: blobs.full },
      { name: thumbName(photo.id), data: blobs.thumb },
    );
  }
  const manifest = JSON.stringify({
    format: PHOTOS_FORMAT,
    formatVersion: PHOTOS_FORMAT_VERSION,
    photos: included,
  });
  entries.splice(1, 0, { name: MANIFEST_ENTRY, data: new Blob([manifest]) });
  return createZip(entries, now);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isText = (value: unknown): value is string => typeof value === 'string';
const isTime = (value: unknown): value is string =>
  isText(value) && !Number.isNaN(Date.parse(value));
const isSize = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

// Ids become file names inside the zip, so keep them to a plain, short alphabet.
const isSafeId = (value: unknown): value is string => isText(value) && /^[\w-]{1,64}$/.test(value);

function isPhoto(value: unknown): value is Photo {
  return (
    isRecord(value) &&
    isSafeId(value.id) &&
    isSafeId(value.sightingId) &&
    isText(value.tripId) &&
    isTime(value.createdAt) &&
    isTime(value.updatedAt) &&
    (value.deletedAt === null || isTime(value.deletedAt)) &&
    isSize(value.width) &&
    isSize(value.height) &&
    isSize(value.bytes)
  );
}

async function parseZip(file: Blob): Promise<ParsedBackup> {
  const entries = new Map((await readZip(file)).map((entry) => [entry.name, entry]));

  const backup = entries.get(BACKUP_ENTRY);
  if (!backup) throw new Error('That zip file is not a Plate Trip backup.');
  const data = parseBackup(await (await backup.read()).text());

  const manifestEntry = entries.get(MANIFEST_ENTRY);
  if (!manifestEntry) return { data, photos: [] };

  let manifest: unknown;
  try {
    manifest = JSON.parse(await (await manifestEntry.read()).text());
  } catch {
    throw new Error('The photo list in that backup is damaged.');
  }
  if (!isRecord(manifest) || manifest.format !== PHOTOS_FORMAT || !Array.isArray(manifest.photos)) {
    throw new Error('The photo list in that backup is damaged.');
  }

  const photos: BackupPhoto[] = [];
  let bad = 0;
  for (const candidate of manifest.photos as unknown[]) {
    if (!isPhoto(candidate)) {
      bad += 1;
      continue;
    }
    const full = entries.get(fullName(candidate.id));
    const thumb = entries.get(thumbName(candidate.id));
    if (!full || !thumb) {
      bad += 1;
      continue;
    }
    photos.push({
      photo: candidate,
      blobs: async () => ({
        full: new Blob([await full.read()], { type: 'image/jpeg' }),
        thumb: new Blob([await thumb.read()], { type: 'image/jpeg' }),
      }),
    });
  }
  if (bad > 0) throw new Error(`The backup is damaged: ${bad} photo(s) are missing or malformed.`);
  return { data, photos };
}

/** Reads a backup file, either the plain JSON or the zip that includes photos. */
export async function parseBackupFile(file: Blob): Promise<ParsedBackup> {
  if (await looksLikeZip(file)) return parseZip(file);
  return { data: parseBackup(await file.text()), photos: [] };
}
