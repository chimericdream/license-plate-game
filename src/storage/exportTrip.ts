import { getRegion } from '../data/regions';
import { wallClock } from '../domain/time';
import type { Sighting, Trip } from '../domain/types';

function inTimeOrder(sightings: readonly Sighting[]): Sighting[] {
  return sightings
    .filter((s) => !s.deletedAt)
    .toSorted((a, b) => Date.parse(a.seenAt) - Date.parse(b.seenAt));
}

/** A filesystem-friendly name for a trip: "Road trip, Nov 2026!" -> "road-trip-nov-2026". */
export function slugify(text: string): string {
  const slug = text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'trip';
}

export function exportFilename(trip: Trip, extension: 'csv' | 'gpx'): string {
  return `plate-trip-${slugify(trip.name)}.${extension}`;
}

// ---------------------------------------------------------------- CSV

const CSV_HEADER = [
  'trip',
  'seen_at',
  'local_date',
  'local_time',
  'region_code',
  'region_name',
  'country',
  'latitude',
  'longitude',
  'accuracy_m',
  'place',
  'note',
];

/**
 * Spreadsheets run text that starts with these characters as a formula, which
 * is a way for a note to attack whoever opens the file. A leading apostrophe
 * defuses it.
 */
function defuse(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function csvCell(value: string | number | null | undefined, isText = false): string {
  if (value === null || value === undefined) return '';
  const text = isText ? defuse(String(value)) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** One row per plate, oldest first. Starts with a BOM so Excel reads accents correctly. */
export function tripToCsv(trip: Trip, sightings: readonly Sighting[]): string {
  const rows = inTimeOrder(sightings).map((s) => {
    const region = getRegion(s.regionId);
    const { date, time } = wallClock(s.seenAt);
    return [
      csvCell(trip.name, true),
      csvCell(s.seenAt),
      csvCell(date),
      csvCell(time),
      csvCell(region?.code ?? '', true),
      csvCell(region?.name ?? s.regionId, true),
      csvCell(region?.country ?? '', true),
      csvCell(s.location?.lat),
      csvCell(s.location?.lng),
      csvCell(s.location?.accuracy === null ? null : s.location?.accuracy.toFixed(0)),
      csvCell(s.place, true),
      csvCell(s.note, true),
    ].join(',');
  });
  return `﻿${[CSV_HEADER.join(','), ...rows].join('\r\n')}\r\n`;
}

// ---------------------------------------------------------------- GPX

/** Characters XML 1.0 forbids outright (everything below space except tab, LF and CR). */
// eslint-disable-next-line no-control-regex
const XML_FORBIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

function xml(text: string): string {
  return text
    .replace(XML_FORBIDDEN, '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

const utc = (iso: string) => new Date(iso).toISOString();

/**
 * GPX 1.1: a waypoint for every plate that has a location (named for its
 * state, described with the town and note) and a track joining them in order.
 */
export function tripToGpx(trip: Trip, sightings: readonly Sighting[]): string {
  const located = inTimeOrder(sightings).filter(
    (s): s is Sighting & { location: NonNullable<Sighting['location']> } => s.location !== null,
  );

  const waypoints = located.map((s) => {
    const region = getRegion(s.regionId);
    const name = region ? `${region.name} (${region.code})` : s.regionId;
    const description = [s.place, s.note].filter(Boolean).join(' - ');
    return [
      `  <wpt lat="${s.location.lat}" lon="${s.location.lng}">`,
      `    <time>${utc(s.seenAt)}</time>`,
      `    <name>${xml(name)}</name>`,
      description ? `    <desc>${xml(description)}</desc>` : null,
      '  </wpt>',
    ]
      .filter((line) => line !== null)
      .join('\n');
  });

  const trackPoints = located.map(
    (s) =>
      `      <trkpt lat="${s.location.lat}" lon="${s.location.lng}"><time>${utc(s.seenAt)}</time></trkpt>`,
  );

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Plate Trip" xmlns="http://www.topografix.com/GPX/1/1">',
    `  <metadata><name>${xml(trip.name)}</name></metadata>`,
    ...waypoints,
    ...(trackPoints.length > 0
      ? [
          '  <trk>',
          `    <name>${xml(trip.name)}</name>`,
          '    <trkseg>',
          ...trackPoints,
          '    </trkseg>',
          '  </trk>',
        ]
      : []),
    '</gpx>',
    '',
  ].join('\n');
}

export function countLocated(sightings: readonly Sighting[]): number {
  return sightings.filter((s) => !s.deletedAt && s.location !== null).length;
}
