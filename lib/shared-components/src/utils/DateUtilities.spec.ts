import {
  formatLocalDateTime,
  getLocalTimeZoneLabel,
  localDateTimeInputToIso,
  parseLocalDateInput,
  parseLocalDateTimeInput,
  toLocalDateInput,
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

// LS-10486: date-only helpers must give the same calendar day in every zone.
// process.env.TZ is switched per case (Node re-reads it on each Date call) so
// the suite exercises zones both east and west of UTC regardless of the runner.
describe.each(['Asia/Kolkata', 'America/Los_Angeles', 'Pacific/Auckland'])(
  'local date-only helpers under TZ=%s (LS-10486)',
  (zone) => {
    const originalTz = process.env.TZ;
    beforeAll(() => {
      process.env.TZ = zone;
    });
    afterAll(() => {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    });

    it('formats local midnight as the same calendar day', () => {
      expect(toLocalDateInput(new Date(2026, 9, 8))).toBe('2026-10-08');
      expect(toLocalDateInput(new Date(2026, 0, 1))).toBe('2026-01-01');
    });

    it('formats a late-evening local time as that local day', () => {
      expect(toLocalDateInput(new Date(2026, 9, 8, 23, 30))).toBe('2026-10-08');
    });

    it('parses YYYY-MM-DD to local midnight of the same day', () => {
      const parsed = parseLocalDateInput('2026-10-08');
      expect(parsed?.getFullYear()).toBe(2026);
      expect(parsed?.getMonth()).toBe(9);
      expect(parsed?.getDate()).toBe(8);
      expect(parsed?.getHours()).toBe(0);
    });

    it('round-trips format → parse → format', () => {
      for (const key of [
        '2026-01-01',
        '2026-03-08',
        '2026-11-01',
        '2026-12-31',
      ]) {
        expect(toLocalDateInput(parseLocalDateInput(key) as Date)).toBe(key);
      }
    });
  },
);

describe('local date-only helpers: invalid input (LS-10486)', () => {
  it('rejects malformed and non-existent dates', () => {
    expect(parseLocalDateInput('')).toBeUndefined();
    expect(parseLocalDateInput(null)).toBeUndefined();
    expect(parseLocalDateInput('10/08/2026')).toBeUndefined();
    expect(parseLocalDateInput('2026-02-31')).toBeUndefined();
  });

  it('formats an invalid Date as an empty string', () => {
    expect(toLocalDateInput(new Date(NaN))).toBe('');
  });
});
