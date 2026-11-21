import { describe, expect, it } from 'vitest';
import type { Sighting, Trip } from '../domain/types';
import { countLocated, exportFilename, slugify, tripToCsv, tripToGpx } from './exportTrip';

const trip: Trip = {
  id: 't1',
  name: 'Road trip, Nov 2026',
  startedAt: '2026-11-21T08:00:00.000-07:00',
  endedAt: null,
  createdAt: '2026-11-21T08:00:00.000-07:00',
  updatedAt: '2026-11-21T08:00:00.000-07:00',
  deletedAt: null,
};

function sighting(overrides: Partial<Sighting> & { id: string }): Sighting {
  return {
    tripId: 't1',
    regionId: 'US-CO',
    seenAt: '2026-11-21T10:00:00.000-07:00',
    location: {
      lat: 39.7392,
      lng: -104.9903,
      accuracy: 12.4,
      capturedAt: '2026-11-21T10:00:00.000-07:00',
    },
    note: '',
    createdAt: '2026-11-21T10:00:00.000-07:00',
    updatedAt: '2026-11-21T10:00:00.000-07:00',
    deletedAt: null,
    ...overrides,
  };
}

describe('slugify / exportFilename', () => {
  it('makes safe file names', () => {
    expect(slugify('Road trip, Nov 2026!')).toBe('road-trip-nov-2026');
    expect(slugify('Québec → Cancún')).toBe('quebec-cancun');
    expect(slugify('???')).toBe('trip');
    expect(exportFilename(trip, 'gpx')).toBe('plate-trip-road-trip-nov-2026.gpx');
  });
});

describe('tripToCsv', () => {
  it('writes a header and one row per live plate, oldest first, with a BOM', () => {
    const csv = tripToCsv(trip, [
      sighting({
        id: 'b',
        regionId: 'US-UT',
        seenAt: '2026-11-21T12:00:00.000-07:00',
        place: 'Moab, Utah',
      }),
      sighting({ id: 'a' }),
      sighting({ id: 'gone', deletedAt: '2026-11-21T13:00:00.000-07:00' }),
    ]);
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.trimEnd().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(
      '﻿trip,seen_at,local_date,local_time,region_code,region_name,country,latitude,longitude,accuracy_m,place,note',
    );
    expect(lines[1]).toContain('Colorado');
    expect(lines[1]).toContain('2026-11-21,10:00,CO,Colorado,US,39.7392,-104.9903,12');
    expect(lines[2]).toContain('Utah');
    expect(lines[2]).toContain('"Moab, Utah"');
  });

  it('quotes commas, quotes and newlines, and leaves blanks for missing data', () => {
    const csv = tripToCsv(trip, [
      sighting({ id: 'a', note: 'He said "hi",\nthen left', location: null }),
    ]);
    expect(csv).toContain('"He said ""hi"",\nthen left"');
    expect(csv).toContain(',US,,,,,"He said');
  });

  it('defuses spreadsheet formulas in text fields but not in coordinates', () => {
    const csv = tripToCsv(trip, [
      sighting({
        id: 'a',
        note: '=HYPERLINK("http://evil")',
        location: {
          lat: -33.9,
          lng: -70.6,
          accuracy: null,
          capturedAt: '2026-11-21T10:00:00.000Z',
        },
      }),
    ]);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(csv).toContain(',-33.9,-70.6,');
  });
});

describe('tripToGpx', () => {
  it('writes waypoints and a track for located plates, in UTC and time order', () => {
    const gpx = tripToGpx(trip, [
      sighting({
        id: 'b',
        regionId: 'US-UT',
        seenAt: '2026-11-21T12:00:00.000-07:00',
        place: 'Moab, Utah',
        note: 'Arches',
        location: {
          lat: 38.57,
          lng: -109.55,
          accuracy: 5,
          capturedAt: '2026-11-21T12:00:00.000-07:00',
        },
      }),
      sighting({ id: 'a' }),
      sighting({ id: 'nolocation', location: null }),
    ]);
    expect(gpx).toContain('<gpx version="1.1" creator="Plate Trip"');
    expect(gpx.match(/<wpt /g)).toHaveLength(2);
    expect(gpx.match(/<trkpt /g)).toHaveLength(2);
    expect(gpx.indexOf('Colorado (CO)')).toBeLessThan(gpx.indexOf('Utah (UT)'));
    expect(gpx).toContain('<time>2026-11-21T17:00:00.000Z</time>');
    expect(gpx).toContain('<desc>Moab, Utah - Arches</desc>');
    expect(gpx).toContain('lat="39.7392" lon="-104.9903"');
  });

  it('escapes XML and strips characters XML cannot hold', () => {
    const gpx = tripToGpx({ ...trip, name: 'A & B <test>' }, [
      sighting({ id: 'a', note: 'quote " and \u0000 nul' }),
    ]);
    expect(gpx).toContain('A &amp; B &lt;test&gt;');
    expect(gpx).toContain('quote &quot; and  nul');
    expect(gpx).not.toContain('\u0000');
  });

  it('omits the track when nothing has a location', () => {
    const gpx = tripToGpx(trip, [sighting({ id: 'a', location: null })]);
    expect(gpx).not.toContain('<wpt');
    expect(gpx).not.toContain('<trk>');
    expect(gpx).toContain('</gpx>');
  });
});

describe('countLocated', () => {
  it('counts live plates that have a position', () => {
    expect(
      countLocated([
        sighting({ id: 'a' }),
        sighting({ id: 'b', location: null }),
        sighting({ id: 'c', deletedAt: '2026-11-21T13:00:00.000Z' }),
      ]),
    ).toBe(1);
  });
});
