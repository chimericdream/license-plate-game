import { describe, expect, it } from 'vitest';
import { isoWithOffset, minutesBetween } from './time';

describe('isoWithOffset', () => {
  it('round-trips to the same instant and carries an explicit offset', () => {
    const d = new Date('2026-11-21T20:05:09.123Z');
    const iso = isoWithOffset(d);
    expect(iso).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}[+-]\d\d:\d\d$/);
    expect(Date.parse(iso)).toBe(d.getTime());
  });
});

describe('minutesBetween', () => {
  it('measures elapsed minutes', () => {
    expect(minutesBetween('2026-11-21T12:00:00.000Z', new Date('2026-11-21T12:45:00.000Z'))).toBe(
      45,
    );
  });
});
