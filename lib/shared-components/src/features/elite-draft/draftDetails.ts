/**
 * Draft Details (LS-9857) — the read-only settings summary the draft board's
 * rail carries, mirroring the "Draft Details" block in the draft-board mock
 * (docs/design/.../mockups/draft.html).
 *
 * Everything here is derived from settings the board already fetches
 * (`GetLeagueById` for the league row, `GetLiveDraftLeagueDraft` for the draft
 * row — see hooks/useDraftQueries.ts), so the panel adds no round-trip. The
 * draft pool query is already the board's largest DB-time consumer (LS-3113);
 * this deliberately does not touch it.
 */
import {
  CUSTOM_ERA_MIN_YEAR_BY_SPORT,
  DRAFT_ORDERS,
  ERA_YEAR_RANGES_BY_SPORT,
  KEEPER_ONLY_DRAFT_ORDERS,
  type SportKind,
} from '../../config/sports';

/** Shown wherever a setting has not been resolved yet (query still in flight). */
export const DRAFT_DETAIL_UNKNOWN = '—';

/**
 * The already-loaded league + draft settings the panel reads. Every field is
 * optional so a partially-resolved cache renders placeholders rather than
 * throwing.
 */
export interface DraftDetailsSettings {
  sport: SportKind;
  /** drafts.draft_order — 'snake' | 'linear' | 'reverse_standings'. */
  draftOrder?: string | null;
  /** leagues.max_roster_size — one draft round per roster spot. */
  maxRosterSize?: number | null;
  /** drafts.pick_time_limit_seconds. */
  pickTimeLimitSeconds?: number | null;
  /** drafts.auto_pick_disabled — league-wide commissioner kill switch (LS-481). */
  autoPickDisabled?: boolean | null;
  /** leagues.era_filter — 'all' | a predefined era key | 'custom'. */
  eraFilter?: string | null;
  customEraStartYear?: number | null;
  customEraEndYear?: number | null;
  minCareerGames?: number | null;
  baseballHofOnly?: boolean | null;
}

export interface DraftDetailRow {
  /** Stable React key / testID suffix. */
  key: string;
  label: string;
  value: string;
}

/** 'snake' → 'Snake', 'reverse_standings' → 'Reverse Standings'. */
const DRAFT_ORDER_LABELS: Record<string, string> = Object.fromEntries(
  [...DRAFT_ORDERS, ...KEEPER_ONLY_DRAFT_ORDERS].map((o) => [o.value, o.label]),
);

/** "90 seconds" / "2 minutes" / "24 hours" / "Untimed". */
export function formatPickClock(seconds: number | null | undefined): string {
  if (seconds == null) return DRAFT_DETAIL_UNKNOWN;
  if (seconds <= 0) return 'Untimed';
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600;
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  return `${seconds} seconds`;
}

/**
 * "All eras · 1876–present" in the mock. The era floor comes from
 * CUSTOM_ERA_MIN_YEAR_BY_SPORT (1871 baseball / 1920 football), the
 * repo's single source of truth for a sport's earliest season — it mirrors
 * `CUSTOM_ERA_MIN_YEAR_BY_SPORT` in the server's sport-validation module.
 */
export function formatPlayerPool(settings: DraftDetailsSettings): string {
  const { sport, eraFilter, customEraStartYear, customEraEndYear } = settings;
  const minYear = CUSTOM_ERA_MIN_YEAR_BY_SPORT[sport];
  // `baseballHofOnly` is a baseball-only league setting — never surface it on a
  // football board even if the column carries a stale value.
  const hofSuffix =
    sport === 'baseball' && settings.baseballHofOnly ? ' · HOF only' : '';

  if (eraFilter === 'custom') {
    const start = customEraStartYear ?? minYear;
    const end = customEraEndYear == null ? 'present' : String(customEraEndYear);
    return `Custom era · ${start}–${end}${hofSuffix}`;
  }

  const range = eraFilter
    ? ERA_YEAR_RANGES_BY_SPORT[sport][eraFilter]
    : undefined;
  if (range) {
    // 9999 is the open-ended sentinel used by the "current era" entries.
    const end = range.end >= 9999 ? 'present' : String(range.end);
    return `${range.label} · ${range.start}–${end}${hofSuffix}`;
  }

  return `All eras · ${minYear}–present${hofSuffix}`;
}

/** "Snake · 23 rounds" — one round per roster spot. */
export function formatFormat(settings: DraftDetailsSettings): string {
  const orderLabel = settings.draftOrder
    ? (DRAFT_ORDER_LABELS[settings.draftOrder] ?? DRAFT_DETAIL_UNKNOWN)
    : DRAFT_DETAIL_UNKNOWN;
  const rounds = settings.maxRosterSize;
  if (rounds == null || rounds <= 0) return orderLabel;
  return `${orderLabel} · ${rounds} round${rounds === 1 ? '' : 's'}`;
}

/**
 * How the team slot order was arrived at. `reverse_standings` (LS-8929)
 * derives it from the prior season's finish; every other draft order is
 * arranged by the commissioner (set explicitly or randomized), which the mock
 * labels "Custom". The database stores no separate manual-vs-randomized flag,
 * so those two cases are not distinguishable here.
 */
export function formatDraftOrderSource(
  draftOrder: string | null | undefined,
): string {
  if (!draftOrder) return DRAFT_DETAIL_UNKNOWN;
  if (draftOrder === 'reverse_standings') return 'Reverse standings';
  return 'Custom';
}

/**
 * The six rows of the Draft Details panel, in mock order. Pure — safe to call
 * on every render.
 */
export function buildDraftDetailRows(
  settings: DraftDetailsSettings,
): DraftDetailRow[] {
  return [
    { key: 'format', label: 'Format', value: formatFormat(settings) },
    {
      key: 'pick-clock',
      label: 'Pick clock',
      value: formatPickClock(settings.pickTimeLimitSeconds),
    },
    {
      key: 'player-pool',
      label: 'Player pool',
      value: formatPlayerPool(settings),
    },
    {
      key: 'min-career-games',
      label: 'Min. career games',
      value:
        settings.minCareerGames == null
          ? DRAFT_DETAIL_UNKNOWN
          : String(settings.minCareerGames),
    },
    {
      key: 'auto-pick',
      label: 'Auto-pick',
      value:
        settings.autoPickDisabled == null
          ? DRAFT_DETAIL_UNKNOWN
          : settings.autoPickDisabled
            ? 'Disabled'
            : 'Enabled',
    },
    {
      key: 'draft-order',
      label: 'Draft order',
      value: formatDraftOrderSource(settings.draftOrder),
    },
  ];
}
