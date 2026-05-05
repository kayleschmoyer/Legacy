/** Returns an ISO-style UTC offset string from an offset-in-minutes value. */
export function formatUtcOffset(offsetMin: number): string {
  const sign = offsetMin >= 0 ? '+' : '-';
  const h = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, '0');
  const m = String(Math.abs(offsetMin) % 60).padStart(2, '0');
  return `UTC${sign}${h}:${m}`;
}

/** Returns the user's IANA timezone name with its current UTC offset. */
export function getUserTimezoneLabel(): string {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const offsetMin = -new Date().getTimezoneOffset();
  return `${tz} (${formatUtcOffset(offsetMin)})`;
}

/** Formats a Date as a human-readable local timestamp (or fallback text if no date). */
export function formatDraftDate(d?: Date): string {
  if (!d) return 'whenever you schedule it';
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Formats a Date as a human-readable UTC timestamp. */
export function formatDateAsUTC(d: Date): string {
  return (
    d.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
    }) + ' UTC'
  );
}
