import {
  buildCoverageReport,
  POOR_COVERAGE_THRESHOLD,
  renderCoverageReportMarkdown,
} from './coverage-report';
import type { PfaCrosswalkRow } from './types';

function row(overrides: Partial<PfaCrosswalkRow> = {}): PfaCrosswalkRow {
  return {
    pfaId: 'x',
    pfaName: 'Someone',
    pfaCollege: null,
    pfaLeague: 'nfl',
    playerId: 1,
    confidence: 0.9,
    matchMethod: 'exact_name_unique',
    candidateCount: 1,
    matchedFinalSeason: 1985,
    ...overrides,
  };
}

describe('buildCoverageReport', () => {
  it('buckets matched rows by decade of final season', () => {
    const report = buildCoverageReport([
      row({ matchedFinalSeason: 1965 }),
      row({ matchedFinalSeason: 1969 }),
      row({ matchedFinalSeason: 1978 }),
    ]);
    const decades = Object.fromEntries(
      report.byDecade.map((d) => [d.decade, d]),
    );
    expect(decades['1960s']).toMatchObject({ total: 2, matched: 2 });
    expect(decades['1970s']).toMatchObject({ total: 1, matched: 1 });
  });

  it('buckets unresolved rows separately rather than guessing a decade', () => {
    const report = buildCoverageReport([
      row({
        playerId: null,
        matchMethod: 'no_match',
        matchedFinalSeason: null,
      }),
      row({ matchedFinalSeason: 1985 }),
    ]);
    const unresolved = report.byDecade.find((d) => d.decade === 'unresolved');
    expect(unresolved).toMatchObject({ total: 1, matched: 0 });
  });

  it('flags decades below the poor-coverage threshold explicitly', () => {
    const report = buildCoverageReport([
      row({ matchedFinalSeason: 1965 }),
      row({
        playerId: null,
        matchMethod: 'ambiguous_unresolved',
        matchedFinalSeason: null,
      }),
      row({
        playerId: null,
        matchMethod: 'ambiguous_unresolved',
        matchedFinalSeason: null,
      }),
    ]);
    // "unresolved" bucket itself should never appear in poorCoverageDecades
    // — it's surfaced as its own row instead.
    expect(report.poorCoverageDecades).not.toContain('unresolved');
  });

  it('flags a decade whose match rate is below threshold', () => {
    const report = buildCoverageReport([
      row({ matchedFinalSeason: 1965 }),
      row({ matchedFinalSeason: 1965, playerId: 2 }),
      row({
        matchedFinalSeason: 1965,
        playerId: null,
        matchMethod: 'no_match',
      }),
      row({
        matchedFinalSeason: 1965,
        playerId: null,
        matchMethod: 'no_match',
      }),
      row({
        matchedFinalSeason: 1965,
        playerId: null,
        matchMethod: 'no_match',
      }),
    ]);
    // matched: no_match rows carry matchedFinalSeason: null per the resolver
    // in practice, but this test isolates buildCoverageReport's own bucket
    // logic — 2/5 = 0.4 < threshold either way.
    const decade = report.byDecade.find((d) => d.decade === '1960s');
    expect(decade).toBeDefined();
    expect(decade?.matchRate).toBeLessThan(POOR_COVERAGE_THRESHOLD);
    expect(report.poorCoverageDecades).toContain('1960s');
  });

  it('computes an overall match rate', () => {
    const report = buildCoverageReport([
      row({ matchedFinalSeason: 1965 }),
      row({
        playerId: null,
        matchMethod: 'no_match',
        matchedFinalSeason: null,
      }),
    ]);
    expect(report.totalRows).toBe(2);
    expect(report.totalMatched).toBe(1);
    expect(report.overallMatchRate).toBe(0.5);
  });

  it('handles an empty input without dividing by zero', () => {
    const report = buildCoverageReport([]);
    expect(report.totalRows).toBe(0);
    expect(report.overallMatchRate).toBe(0);
    expect(report.byDecade).toEqual([]);
  });
});

describe('renderCoverageReportMarkdown', () => {
  it('renders a markdown table with a warning marker on flagged decades', () => {
    const report = buildCoverageReport([
      row({
        matchedFinalSeason: 1965,
        playerId: null,
        matchMethod: 'no_match',
      }),
    ]);
    const markdown = renderCoverageReportMarkdown(report);
    expect(markdown).toContain('1960s');
    expect(markdown).toContain('⚠️');
  });

  it('states plainly when nothing was flagged', () => {
    const report = buildCoverageReport([row({ matchedFinalSeason: 1965 })]);
    const markdown = renderCoverageReportMarkdown(report);
    expect(markdown).toContain('No decade fell below');
  });
});
