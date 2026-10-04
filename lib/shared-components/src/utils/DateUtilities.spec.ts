import {
  formatLocalDateTime,
  getLocalTimeZoneLabel,
  localDateTimeInputToIso,
  parseLocalDateTimeInput,
  toLocalDateTimeInput,
} from './DateUtilities';

// These tests run in whatever zone the runner uses, so expectations are
// derived from the local Date getters rather than hard-coded wall-clock values.
// (Verified manually with TZ=America/New_York: 20:06Z ⇄ "16:06" EDT.)
const pad = (n: number) => String(n).padStart(2, '0');
const localDigits = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

describe('local-time instant helpers (LS-10471)', () => {
  const instant = new Date('2026-10-03T20:06:00.000Z');

  describe('toLocalDateTimeInput', () => {
    it('renders a stored UTC instant as local wall-clock time', () => {
      expect(toLocalDateTimeInput(instant.toISOString())).toBe(
        localDigits(instant),
      );
    });

    it('accepts a Date built from local fields', () => {
      expect(toLocalDateTimeInput(new Date(2026, 9, 3, 16, 6))).toBe(
        '2026-10-03T16:06',
      );
    });

    it.each([null, undefined, '', 'not-a-date'])(
      'returns an empty string for %p',
      (value) => {
        expect(toLocalDateTimeInput(value)).toBe('');
      },
    );
  });

  describe('parseLocalDateTimeInput', () => {
    it('parses as local time, not UTC', () => {
      expect(parseLocalDateTimeInput('2026-10-03T16:06')?.getTime()).toBe(
        new Date(2026, 9, 3, 16, 6).getTime(),
      );
    });

    it('accepts seconds', () => {
      expect(parseLocalDateTimeInput('2026-10-03T16:06:30')?.getSeconds()).toBe(
        30,
      );
    });

    it.each(['', '2026-10-03', '2026-10-03T16:06Z', 'garbage'])(
      'returns undefined for %p',
      (value) => {
        expect(parseLocalDateTimeInput(value)).toBeUndefined();
      },
    );
  });

  describe('localDateTimeInputToIso', () => {
    it('converts local entry to the UTC instant', () => {
      expect(localDateTimeInputToIso('2026-10-03T16:06')).toBe(
        new Date(2026, 9, 3, 16, 6).toISOString(),
      );
    });

    it('round-trips with toLocalDateTimeInput', () => {
      const iso = '2027-01-15T03:45:00.000Z';
      expect(localDateTimeInputToIso(toLocalDateTimeInput(iso))).toBe(iso);
    });

    it('returns undefined for empty input', () => {
      expect(localDateTimeInputToIso('')).toBeUndefined();
    });
  });

  describe('getLocalTimeZoneLabel', () => {
    it('matches the runtime short zone name', () => {
      const expected = new Intl.DateTimeFormat('en-US', {
        timeZoneName: 'short',
      })
        .formatToParts(instant)
        .find((p) => p.type === 'timeZoneName')?.value;
      expect(getLocalTimeZoneLabel(instant)).toBe(expected);
    });
  });

  describe('formatLocalDateTime', () => {
    it('shows the instant in local time with the zone label', () => {
      const text = formatLocalDateTime(instant.toISOString());
      const hour12 = instant.getHours() % 12 || 12;
      expect(text).toContain(`${hour12}:${pad(instant.getMinutes())}`);
      expect(text.endsWith(` ${getLocalTimeZoneLabel(instant)}`)).toBe(true);
    });

    it('does not double the zone when the caller asks for timeZoneName', () => {
      const label = getLocalTimeZoneLabel(instant);
      const text = formatLocalDateTime(instant, {
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      });
      expect(text.split(label)).toHaveLength(2);
    });

    it('returns an empty string for an invalid value', () => {
      expect(formatLocalDateTime('nope')).toBe('');
    });
  });
});
