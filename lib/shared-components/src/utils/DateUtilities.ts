export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// ── Local-time instants (LS-10471) ───────────────────────────────────────────
// Product rule: every date/time the user enters or reads is in their local
// time zone. Instants are stored as UTC ISO-8601 and converted only at the
// edges via these helpers. Calendar dates (game dates, season dates) are not
// instants and must not go through them.

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Format an instant as a local wall-clock `YYYY-MM-DDTHH:MM` string (the
 * `datetime-local` input convention). Returns '' for a missing or invalid value.
 */
export function toLocalDateTimeInput(
  value: Date | string | null | undefined,
): string {
  if (value == null || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/**
 * Parse a local wall-clock `YYYY-MM-DDTHH:MM[:SS]` string into a Date. Parsed
 * field-by-field so the result never depends on an engine's handling of
 * offset-less ISO strings. Returns undefined for malformed input.
 */
export function parseLocalDateTimeInput(
  value: string | null | undefined,
): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    value ?? '',
  );
  if (!match) return undefined;
  const [, y, mo, d, h, mi, s] = match;
  const date = new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s ?? 0),
  );
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Convert a local wall-clock `YYYY-MM-DDTHH:MM` string to a UTC ISO-8601 instant. */
export function localDateTimeInputToIso(
  value: string | null | undefined,
): string | undefined {
  return parseLocalDateTimeInput(value)?.toISOString();
}

/**
 * Short name of the user's local time zone at `date` (e.g. "EDT", "GMT+2"),
 * falling back to the IANA zone id when the runtime has no short name.
 */
export function getLocalTimeZoneLabel(date: Date = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
      .formatToParts(date)
      .find((p) => p.type === 'timeZoneName');
    if (part?.value) return part.value;
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'local time';
  } catch {
    return 'local time';
  }
}

/** Format an instant in the user's local time zone, including the zone label. */
export function formatLocalDateTime(
  value: Date | string,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: 'medium',
    timeStyle: 'short',
  },
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const formatted = date.toLocaleString('en-US', options);
  // dateStyle/timeStyle can't be combined with timeZoneName, so append it.
  return options.timeZoneName
    ? formatted
    : `${formatted} ${getLocalTimeZoneLabel(date)}`;
}
