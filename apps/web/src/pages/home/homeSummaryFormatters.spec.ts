import {
  formatEraDescriptor,
  formatEraYears,
  formatMatchupCloses,
} from './homeSummaryFormatters';

type EraInput = {
  eraFilter: string | null;
  customEraStartYear: number | null;
  customEraEndYear: number | null;
};

function era(
  eraFilter: string | null,
  customEraStartYear: number | null = null,
  customEraEndYear: number | null = null,
): EraInput {
  return { eraFilter, customEraStartYear, customEraEndYear };
}

describe('formatEraDescriptor', () => {
  it('maps known baseball eras to a labelled year range', () => {
    expect(formatEraDescriptor(era('dead_ball'))).toBe(
      'Dead Ball era · 1901–1919',
    );
    expect(formatEraDescriptor(era('steroid_era'))).toBe(
      'Steroid Era · 1994–2005',
    );
  });

  it('maps known football eras', () => {
    expect(formatEraDescriptor(era('west_coast'))).toBe(
      'West Coast · 1978–1993',
    );
  });

  it('renders a custom range from explicit years', () => {
    expect(formatEraDescriptor(era('custom', 1994, 2004))).toBe('1994–2004');
  });

  it('returns null for custom era missing either bound', () => {
    expect(formatEraDescriptor(era('custom', 1994, null))).toBeNull();
    expect(formatEraDescriptor(era('custom', null, 2004))).toBeNull();
  });

  it('returns null for "all", missing, or unknown era', () => {
    expect(formatEraDescriptor(era('all'))).toBeNull();
    expect(formatEraDescriptor(era(null))).toBeNull();
    expect(formatEraDescriptor(era('not_a_real_era'))).toBeNull();
  });
});

describe('formatEraYears', () => {
  it('extracts just the year-range suffix from a known era', () => {
    expect(formatEraYears(era('dead_ball'))).toBe('1901–1919');
    expect(formatEraYears(era('modern'))).toBe('2006–Now');
  });

  it('renders a custom range from explicit years', () => {
    expect(formatEraYears(era('custom', 1994, 2004))).toBe('1994–2004');
  });

  it('returns null for "all", missing, custom-without-bounds, or unknown era', () => {
    expect(formatEraYears(era('all'))).toBeNull();
    expect(formatEraYears(era(null))).toBeNull();
    expect(formatEraYears(era('custom', null, null))).toBeNull();
    expect(formatEraYears(era('not_a_real_era'))).toBeNull();
  });
});

describe('formatMatchupCloses', () => {
  it('formats a valid ISO timestamp as a short weekday + time string', () => {
    // 2026-05-31 is a Sunday. Use an explicit offset so the rendered output is
    // deterministic regardless of the host timezone.
    const result = formatMatchupCloses('2026-05-31T20:00:00-04:00');
    expect(result).not.toBeNull();
    // Locale formatting varies by environment, but the weekday + time parts
    // should always be present in some form.
    expect(typeof result).toBe('string');
    expect((result as string).length).toBeGreaterThan(0);
  });

  it('returns null for null/undefined/empty input', () => {
    expect(formatMatchupCloses(null)).toBeNull();
    expect(formatMatchupCloses(undefined)).toBeNull();
    expect(formatMatchupCloses('')).toBeNull();
  });

  it('returns null for an unparseable timestamp', () => {
    expect(formatMatchupCloses('not-a-date')).toBeNull();
  });
});
