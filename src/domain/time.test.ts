import { describe, expect, it } from 'vitest';
import {
  formatDay,
  formatTime,
  isoWithOffset,
  minutesBetween,
  toLocalInputValue,
  wallClock,
  withWallClock,
} from './time';

describe('isoWithOffset', () => {
  it('round-trips to the same instant and carries an explicit offset', () => {
    const d = new Date('2026-11-21T20:05:09.123Z');
    const iso = isoWithOffset(d);
    expect(iso).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}[+-]\d\d:\d\d$/);
    expect(Date.parse(iso)).toBe(d.getTime());
  });
});

describe('wall-clock helpers', () => {
  const iso = '2026-11-21T14:05:09.000-07:00';

  it('reads the date and time as the traveler saw them', () => {
    expect(wallClock(iso)).toEqual({ date: '2026-11-21', time: '14:05' });
    expect(toLocalInputValue(iso)).toBe('2026-11-21T14:05');
  });

  it('applies an edit while keeping the original UTC offset', () => {
    const edited = withWallClock(iso, '2026-11-21T15:30');
    expect(edited).toBe('2026-11-21T15:30:00.000-07:00');
    expect(Date.parse(edited)).toBe(Date.parse('2026-11-21T22:30:00.000Z'));
    expect(withWallClock('2026-11-21T14:00:00.000Z', '2026-11-21T15:00')).toBe(
      '2026-11-21T15:00:00.000Z',
    );
  });

  it('formats days and times without shifting them', () => {
    expect(formatDay('2026-11-21')).toContain('21');
    expect(formatTime('14:05')).toMatch(/2:05/);
  });
});

describe('minutesBetween', () => {
  it('measures elapsed minutes', () => {
    expect(minutesBetween('2026-11-21T12:00:00.000Z', new Date('2026-11-21T12:45:00.000Z'))).toBe(
      45,
    );
  });
});
