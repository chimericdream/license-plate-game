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

export function minutesBetween(earlierIso: string, later: Date): number {
  return (later.getTime() - Date.parse(earlierIso)) / 60_000;
}
