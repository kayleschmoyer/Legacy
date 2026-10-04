// Pure presentational formatters for the shared Home dashboard. Kept free of
// any app-specific GraphQL types so both web and mobile can feed their own
// league-summary shapes through `HomeScreen`.

/** Subset of league-summary fields needed to derive an era descriptor. */
export interface EraFields {
  eraFilter?: string | null;
  customEraStartYear?: number | null;
  customEraEndYear?: number | null;
}

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
 * Just the era name for the Leagues ledger sub-line, e.g. "Dead Ball era" —
 * the year range is dropped because the ledger pairs the era with a team
 * count. Returns null when no meaningful era is set; a custom range has no
 * name, so it falls back to the year range itself.
 */
export function formatEraName(summary: EraFields): string | null {
  const era = summary.eraFilter;
  if (!era || era === 'all') return null;
  if (era === 'custom') return formatEraYears(summary);
  const label = ERA_LABELS[era];
  if (!label) return null;
  const idx = label.lastIndexOf('·');
  return idx >= 0 ? label.slice(0, idx).trim() : label;
}

/**
 * Day-only draft date for the Leagues ledger's 52px W-L column, e.g. "Aug 2".
 * `formatDraftDate` from `@legacy-sports/utils` includes the time, which is
 * right for the row sub-line but overflows the column. Returns '' for missing
 * or unparseable input, matching `formatDraftDate`.
 */
export function formatDraftDayShort(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    // Hermes release builds without full ICU data can leave
    // toLocaleDateString undefined — local MM-DD, mirroring formatDraftDate's
    // local fallback (LS-10471).
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
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

/** Strip email domain from a username for display. */
export function formatDisplayName(username: string): string {
  if (/^[^@]+@[^@]+\.[^@]+$/.test(username)) {
    return username.split('@')[0];
  }
  return username;
}
