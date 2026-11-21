const pad = (n: number, len = 2) => String(n).padStart(len, '0');

/**
 * ISO 8601 in the *local* zone with an explicit UTC offset
 * (e.g. `2026-11-21T14:05:09.000-07:00`). Keeps the wall-clock time the
 * traveler saw while still parsing to the right instant.
 */
export function isoWithOffset(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `.${pad(date.getMilliseconds(), 3)}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/** The date and time as the traveler saw them, ignoring the UTC offset. */
export function wallClock(iso: string): { date: string; time: string } {
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/** `datetime-local` input value (`YYYY-MM-DDTHH:mm`) for a stored time. */
export function toLocalInputValue(iso: string): string {
  const { date, time } = wallClock(iso);
  return `${date}T${time}`;
}

/**
 * Applies an edited wall-clock value to a stored time, keeping the UTC offset
 * of where the plate was seen (so editing in a different zone doesn't shift it).
 */
export function withWallClock(originalIso: string, localValue: string): string {
  const offset = /(Z|[+-]\d\d:\d\d)$/.exec(originalIso)?.[1] ?? 'Z';
  return `${localValue}:00.000${offset}`;
}

/** `YYYY-MM-DD` to a heading like "Saturday, Nov 21". */
export function formatDay(date: string): string {
  const [y = 1970, m = 1, d = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** `YYYY-MM-DD` to a short date like "Nov 21, 2026". */
export function formatDate(date: string): string {
  const [y = 1970, m = 1, d = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** `HH:mm` to a locale time like "2:05 PM". */
export function formatTime(time: string): string {
  const [h = 0, m = 0] = time.split(':').map(Number);
  return new Date(Date.UTC(1970, 0, 1, h, m)).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

export function minutesBetween(earlierIso: string, later: Date): number {
  return (later.getTime() - Date.parse(earlierIso)) / 60_000;
}
