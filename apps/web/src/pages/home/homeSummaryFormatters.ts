import type { UserLeagueSummaryFragment } from '../../api/db/graphql.generated';

/** Maps an era-filter enum value to a "<Name> · <year range>" label. */
export const ERA_LABELS: Record<string, string> = {
  // Baseball
  dead_ball: 'Dead Ball era · 1901–1919',
  golden_age: 'Golden Age · 1920–1945',
  expansion: 'Expansion · 1946–1968',
  free_agency: 'Free Agency · 1969–1993',
  steroid_era: 'Steroid Era · 1994–2005',
  modern: 'Modern · 2006–Now',
  // Football
  pioneer: 'Pioneer · 1920–1945',
  single_platoon: 'Single-Platoon · 1946–1959',
  super_bowl_era: 'Super Bowl Era · 1960–1977',
  west_coast: 'West Coast · 1978–1993',
  salary_cap_era: 'Salary Cap · 1994–2010',
  spread_offense: 'Spread Offense · 2011–Now',
};

type EraFields = Pick<
  UserLeagueSummaryFragment,
  'eraFilter' | 'customEraStartYear' | 'customEraEndYear'
>;

/**
 * Full era descriptor for the hero sub-line, e.g. "Dead Ball era · 1901–1919"
 * or "1994–2004" for a custom range. Returns null when no meaningful era is
 * set (`all`, missing, or an unknown enum value).
 */
export function formatEraDescriptor(summary: EraFields): string | null {
  const era = summary.eraFilter;
  if (!era || era === 'all') return null;
  if (era === 'custom') {
    if (summary.customEraStartYear == null || summary.customEraEndYear == null)
      return null;
    return `${summary.customEraStartYear}–${summary.customEraEndYear}`;
  }
  return ERA_LABELS[era] ?? null;
}

/**
 * Just the year-range portion for the denser league-row subtitle, e.g.
 * "1901–1919". Returns null when no meaningful era is set.
 */
export function formatEraYears(summary: EraFields): string | null {
  const era = summary.eraFilter;
  if (!era || era === 'all') return null;
  if (era === 'custom') {
    if (summary.customEraStartYear == null || summary.customEraEndYear == null)
      return null;
    return `${summary.customEraStartYear}–${summary.customEraEndYear}`;
  }
  // Pull the year-range suffix out of the era label
  // ("Dead Ball era · 1901–1919" → "1901–1919").
  const label = ERA_LABELS[era];
  if (!label) return null;
  const idx = label.lastIndexOf('·');
  return idx >= 0 ? label.slice(idx + 1).trim() : null;
}

/**
 * Formats a matchup end timestamp as a short "<weekday> <time>" string in the
 * viewer's locale, e.g. "Sun 8:00 PM". Returns null for missing or unparseable
 * input.
 */
export function formatMatchupCloses(
  endTime: string | null | undefined,
): string | null {
  if (!endTime) return null;
  const d = new Date(endTime);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    }).format(d);
  } catch {
    return null;
  }
}
