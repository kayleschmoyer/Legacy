import type { PfaCrosswalkRow } from './types';

// Below this match rate, a decade is called out explicitly rather than
// folded into an overall average — per LS-9993 AC ("flag threshold for
// discussion — e.g. <70%").
export const POOR_COVERAGE_THRESHOLD = 0.7;

export interface DecadeCoverage {
  // e.g. "1960s", or "unresolved" for rows with no matched final season.
  decade: string;
  total: number;
  matched: number;
  matchRate: number;
}

export interface CoverageReport {
  generatedAt: string;
  totalRows: number;
  totalMatched: number;
  overallMatchRate: number;
  byDecade: DecadeCoverage[];
  poorCoverageDecades: string[];
}

function decadeLabel(finalSeason: number | null): string {
  if (finalSeason === null) return 'unresolved';
  const decadeStart = Math.floor(finalSeason / 10) * 10;
  return `${decadeStart}s`;
}

function isMatched(row: PfaCrosswalkRow): boolean {
  return row.playerId !== null;
}

/**
 * Builds a decade-stratified coverage report from resolver output, following
 * the LS-9817/LS-9908 method: broken out by decade (of the matched player's
 * final season) rather than a single aggregate, with any decade below
 * POOR_COVERAGE_THRESHOLD called out by name (LS-9993 AC — "explicitly flag
 * ... rather than burying it in an aggregate number").
 *
 * Rows that could not be resolved to a player (no_match / ambiguous) have no
 * known decade and are bucketed under "unresolved" rather than dropped or
 * guessed into a decade.
 */
export function buildCoverageReport(rows: PfaCrosswalkRow[]): CoverageReport {
  const byDecadeMap = new Map<string, { total: number; matched: number }>();

  for (const row of rows) {
    const label = decadeLabel(row.matchedFinalSeason);
    const bucket = byDecadeMap.get(label) ?? { total: 0, matched: 0 };
    bucket.total += 1;
    if (isMatched(row)) bucket.matched += 1;
    byDecadeMap.set(label, bucket);
  }

  const byDecade: DecadeCoverage[] = Array.from(byDecadeMap.entries())
    .map(([decade, { total, matched }]) => ({
      decade,
      total,
      matched,
      matchRate: total === 0 ? 0 : matched / total,
    }))
    .sort((a, b) => {
      if (a.decade === 'unresolved') return 1;
      if (b.decade === 'unresolved') return -1;
      return a.decade.localeCompare(b.decade);
    });

  const totalMatched = rows.filter(isMatched).length;
  // "unresolved" is a real bucket, not a decade with poor coverage — it is
  // surfaced via its own row/count rather than the poor-coverage flag list,
  // which is reserved for decades where a match SHOULD be findable.
  const poorCoverageDecades = byDecade
    .filter(
      (d) => d.decade !== 'unresolved' && d.matchRate < POOR_COVERAGE_THRESHOLD,
    )
    .map((d) => d.decade);

  return {
    generatedAt: new Date().toISOString(),
    totalRows: rows.length,
    totalMatched,
    overallMatchRate: rows.length === 0 ? 0 : totalMatched / rows.length,
    byDecade,
    poorCoverageDecades,
  };
}

export function renderCoverageReportMarkdown(report: CoverageReport): string {
  const lines: string[] = [];
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push(
    `Overall: ${report.totalMatched} / ${report.totalRows} matched (${(
      report.overallMatchRate * 100
    ).toFixed(1)}%)`,
  );
  lines.push('');
  lines.push('| Decade | Total | Matched | Match Rate |');
  lines.push('| --- | --- | --- | --- |');
  for (const d of report.byDecade) {
    const flag = report.poorCoverageDecades.includes(d.decade) ? ' ⚠️' : '';
    lines.push(
      `| ${d.decade}${flag} | ${d.total} | ${d.matched} | ${(
        d.matchRate * 100
      ).toFixed(1)}% |`,
    );
  }
  lines.push('');
  if (report.poorCoverageDecades.length > 0) {
    lines.push(
      `⚠️ Poor coverage (below ${(POOR_COVERAGE_THRESHOLD * 100).toFixed(
        0,
      )}%): ${report.poorCoverageDecades.join(', ')}`,
    );
  } else {
    lines.push(
      `No decade fell below the ${(POOR_COVERAGE_THRESHOLD * 100).toFixed(
        0,
      )}% coverage threshold.`,
    );
  }
  return lines.join('\n');
}
