import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import {
  normalizeViewMode,
  PlayerStatsPage,
  type PlayerStatsViewMode,
} from '@legacy-sports/shared-components/players';
import type {
  PlayerStatsFilters,
  PlayerWithStats,
} from '@legacy-sports/shared-components/players';
import { LOGGER } from '@legacy-sports/logging';
import { ENTITLEMENTS } from '@legacy-sports/utils';
import { PageMeta } from '../../components/PageMeta';
import { PremiumGate } from '../../components/PremiumGate';
import { useHasEntitlement } from '../../hooks/useIsPremium';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  SURFACE_CARD,
  TEXT_HIGH_CONTRAST,
  WHITE,
  withAlpha,
} from '../../constants/colors';
import { PlayerDetailModal } from '../../components/PlayerDetailModal';
import {
  Sport,
  useGetPlayerIdByBrefIdQuery,
  useGetUserLeaguesQuery,
} from '@legacy-sports/graphql';
import { useLeagueRosteredPlayerIds } from '../../hooks/useLeagueRosteredPlayerIds';
import { useFeatureValue } from '../../context/GrowthBookProvider';

// Football statistics are served by the dedicated football players browser,
// rendered inline when the sport switcher selects NFL (LS-8104). Lazy-loaded so
// the default MLB stats route doesn't pull the football bundle for every user.
const FootballPlayersPageLazy = React.lazy(() =>
  import('../football/FootballPlayersPage').then((m) => ({
    default: m.FootballPlayersPage,
  })),
);

// GraphQL Int is a 32-bit signed integer — clamp URL param values to prevent query errors
const MAX_GRAPHQL_INT = 2147483647;

const SEARCH_PARAM_MAX_LENGTH = 64;

/**
 * Parse an integer URL search param and clamp it to MAX_GRAPHQL_INT (the
 * 32-bit signed INT ceiling GraphQL accepts). The clamp is good defense
 * against query errors, but silently rewriting the user's requested filter to
 * ~2B is surprising — so emit a LOGGER.warn when the clamp actually triggers
 * (PST-102 / LS-7142). Out-of-range values still clamp as before; NaN passes
 * through unchanged (parseInt returned no digits) to preserve existing
 * behavior. Exported for unit testing.
 */
export function parseClampedInt(raw: string, paramName: string): number {
  const parsed = parseInt(raw, 10);
  if (parsed > MAX_GRAPHQL_INT) {
    LOGGER.warn(
      `[PlayerStatsRoute] ${paramName} value exceeds GraphQL INT max; clamping`,
      { paramName, requested: parsed, clampedTo: MAX_GRAPHQL_INT },
    );
    return MAX_GRAPHQL_INT;
  }
  return parsed;
}

/**
 * Sanitize a URL search parameter value before forwarding to filters.
 * Strips control characters (U+0000–U+001F, U+007F–U+009F) and enforces a
 * maximum length to prevent injection via string-concatenating audit paths.
 */
export function sanitizeSearchParam(value: string | null): string | null {
  if (value === null) return null;
  let stripped = '';
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code > 0x1f && (code < 0x7f || code > 0x9f)) {
      stripped += value[i];
    }
  }
  if (!stripped) return null;
  return stripped.slice(0, SEARCH_PARAM_MAX_LENGTH);
}

/**
 * Build URL search params from a committed filter snapshot. Exported for unit
 * testing — the host component wraps this with `setSearchParams(...)`.
 *
 * Numeric formatting matches the URL param contract documented in
 * `docs/agents/pages/players/stats.md` (3 decimals for AVG, 2 for ERA).
 */
export function buildStatsSearchParams(state: {
  viewMode: PlayerStatsViewMode;
  pageSize: number;
  filters: PlayerStatsFilters;
  sport?: 'mlb' | 'nfl';
}): URLSearchParams {
  const next = new URLSearchParams();
  next.set('view', state.viewMode);
  next.set('pageSize', String(state.pageSize));
  if (state.sport) next.set('sport', state.sport);
  if (state.filters.searchTerm)
    next.set('searchTerm', state.filters.searchTerm);
  if (state.filters.position) next.set('position', state.filters.position);
  if (state.filters.team) next.set('team', state.filters.team);
  if (state.filters.playerType)
    next.set('playerType', state.filters.playerType);
  if (state.filters.minHomeRuns !== undefined) {
    next.set('minHomeRuns', String(state.filters.minHomeRuns));
  }
  if (state.filters.minBattingAvg !== undefined) {
    next.set('minBattingAvg', state.filters.minBattingAvg.toFixed(3));
  }
  if (state.filters.maxERA !== undefined) {
    next.set('maxERA', state.filters.maxERA.toFixed(2));
  }

  // Serialize keys in a deterministic alphabetical order (PST-104). URLSearchParams
  // preserves insertion order, so the same filter state could otherwise produce
  // different query strings depending on which conditional keys were present — bad
  // for CDN caching, analytics deduping, and back-button URL comparisons. Sort by
  // key with a code-unit comparison (locale-independent) so the result is
  // byte-identical across environments.
  const sorted = new URLSearchParams();
  for (const [key, value] of Array.from(next.entries()).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    sorted.append(key, value);
  }
  return sorted;
}

const PREFS_STORAGE_KEY = 'ls_user_preferences';

function readStatsFormat(): 'standard' | 'expanded' {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return 'standard';
    const parsed = JSON.parse(raw) as { statsFormat?: string };
    if (
      parsed.statsFormat === 'standard' ||
      parsed.statsFormat === 'expanded'
    ) {
      return parsed.statsFormat;
    }
    return 'standard';
  } catch {
    return 'standard';
  }
}

function readDefaultSport(): 'baseball' | 'football' {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return 'baseball';
    const parsed = JSON.parse(raw) as { defaultSport?: string };
    return parsed.defaultSport === 'football' ? 'football' : 'baseball';
  } catch {
    return 'baseball';
  }
}

/**
 * Web App Player Statistics Page
 *
 * Integrates the PlayerStatsPage component with React Router for:
 * - URL query parameter state persistence
 * - Navigation integration
 * - Export and sharing functionality
 * - Deep linking support
 */
const TOAST_DURATION_MS = 2400;

const SPORT_SWITCH_FONT = "'Big Shoulders Display', sans-serif";

const sportSwitchButtonStyle = (active: boolean): React.CSSProperties => ({
  padding: '8px 18px',
  minHeight: 40,
  borderRadius: 9999,
  border: 'none',
  backgroundColor: active ? BRAND_NAVY_LIGHT : 'transparent',
  color: active ? WHITE : TEXT_HIGH_CONTRAST,
  fontFamily: SPORT_SWITCH_FONT,
  fontWeight: 700,
  fontSize: 12,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  cursor: active ? 'default' : 'pointer',
});

/**
 * Sport switcher rendered above the stats page. Toggling between MLB and NFL
 * updates the `sport` URL param in place (LS-8104) so the page renders the
 * matching sport's statistics inline — giving football the same on-page stats
 * experience as baseball, instead of redirecting away. Only rendered when
 * football is enabled so a disabled sport is never offered.
 */
function StatsSportSwitcher({
  active,
  onSelectMlb,
  onSelectNfl,
}: {
  active: 'mlb' | 'nfl';
  onSelectMlb: () => void;
  onSelectNfl: () => void;
}) {
  return (
    <div
      style={{
        maxWidth: 1280,
        width: '100%',
        margin: '0 auto',
        padding: '24px 24px 0',
      }}
    >
      <div
        role="group"
        aria-label="Select sport"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: 5,
          background: SURFACE_CARD,
          border: `1px solid ${withAlpha(BRAND_GOLD, 0.2)}`,
          borderRadius: 9999,
        }}
      >
        <button
          type="button"
          onClick={onSelectMlb}
          aria-pressed={active === 'mlb'}
          aria-label="View MLB statistics"
          style={sportSwitchButtonStyle(active === 'mlb')}
        >
          MLB
        </button>
        <button
          type="button"
          onClick={onSelectNfl}
          aria-pressed={active === 'nfl'}
          aria-label="View NFL statistics"
          style={sportSwitchButtonStyle(active === 'nfl')}
        >
          NFL
        </button>
      </div>
    </div>
  );
}

export function PlayerStatsRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [liveMsg, setLiveMsg] = React.useState('');
  const isPremium = useHasEntitlement(ENTITLEMENTS.advanced_search_filters);

  // Check if the user is in at least one baseball league — availability filter
  // is only surfaced when this is true.
  const { data: leaguesData } = useGetUserLeaguesQuery({
    fetchPolicy: 'cache-first',
  });
  const hasBaseballLeagues = (leaguesData?.userLeagues ?? []).some(
    (l) => l.sport === Sport.Baseball,
  );
  const { playerIds: baseballRosteredIds } = useLeagueRosteredPlayerIds(
    Sport.Baseball,
    !hasBaseballLeagues,
  );

  // Derive the active sport from the URL param, falling back to the user's
  // saved default-sport preference. NFL renders football statistics inline
  // (LS-8104) rather than redirecting away to /football/players. Validates
  // against known values so an unrecognised param doesn't corrupt state.
  const sportParam = searchParams.get('sport');
  const sport: 'mlb' | 'nfl' =
    sportParam === 'nfl'
      ? 'nfl'
      : sportParam === 'mlb'
        ? 'mlb'
        : readDefaultSport() === 'football'
          ? 'nfl'
          : 'mlb';

  // Football availability gates the visible sport switcher and the inline
  // football view. Defaults to `true` (matching the route-level FootballGate)
  // so the control isn't hidden while GrowthBook loads or in unconfigured
  // environments.
  const footballEnabled = useFeatureValue('football_enabled', true);
  const showFootball = sport === 'nfl' && footballEnabled !== false;

  // Switch the viewed sport by updating the `sport` URL param in place. Pushes
  // (not replace) so Back returns to the previously viewed sport.
  const handleSelectSport = useCallback(
    (next: 'mlb' | 'nfl') => {
      const params = new URLSearchParams(window.location.search);
      params.set('sport', next);
      setSearchParams(params);
    },
    [setSearchParams],
  );

  // Auto-dismiss the visible toast after TOAST_DURATION_MS while leaving the
  // sr-only live region populated (screen readers re-announce changes; the
  // visible affordance is the confirmation for sighted users).
  useEffect(() => {
    if (!liveMsg) return undefined;
    const timer = window.setTimeout(() => setLiveMsg(''), TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [liveMsg]);

  // Stats format preference from user settings
  const [statsFormat, setStatsFormat] = useState<'standard' | 'expanded'>(
    readStatsFormat,
  );

  // Re-read preference when the page gains focus (user may have changed it on the Preferences page)
  useEffect(() => {
    const handleFocus = () => setStatsFormat(readStatsFormat());
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // Rewrite a legacy/aliased `view` param to its canonical form so the address
  // bar stays in sync with the rendered tab (LS-7146 / PST-111). Without this,
  // /players/stats?view=batting renders the Hitters tab but the URL keeps the
  // `batting` alias forever, which is confusing when the link is shared. Only
  // rewrites when the param is present and non-canonical — an absent or already
  // canonical `view` is left untouched. `replace` avoids polluting history.
  useEffect(() => {
    const rawView = searchParams.get('view');
    if (rawView === null) return;
    const canonical = normalizeViewMode(rawView as PlayerStatsViewMode);
    if (rawView === canonical) return;
    const next = new URLSearchParams(searchParams);
    next.set('view', canonical);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Parse URL parameters for initial state
  const initialState = useMemo(() => {
    // Run the raw `view` param through the shared shell's normalizer so the tab
    // we render is always canonical (combined/hitters/pitchers), honoring legacy
    // aliases (batting→hitters, pitching→pitchers) and unknown values (LS-7146).
    const viewMode = normalizeViewMode(
      (searchParams.get('view') as PlayerStatsViewMode) || 'combined',
    );
    const pageSize = parseInt(searchParams.get('pageSize') || '25', 10);
    const search = searchParams.get('search') || '';

    // Parse filters from URL
    const filters: Partial<PlayerStatsFilters> = {};

    // Career batting filters
    const minHR = searchParams.get('minHomeRuns');
    const maxHR = searchParams.get('maxHomeRuns');
    const minRBI = searchParams.get('minRBI');
    const maxRBI = searchParams.get('maxRBI');
    const minAVG = searchParams.get('minBattingAvg');
    const maxAVG = searchParams.get('maxBattingAvg');

    // Career pitching filters
    const minERA = searchParams.get('minERA');
    const maxERA = searchParams.get('maxERA');
    const minWins = searchParams.get('minWins');
    const maxWins = searchParams.get('maxWins');
    const minSO = searchParams.get('minStrikeouts');
    const maxSO = searchParams.get('maxStrikeouts');

    // Player info filters — sanitized to strip control chars and cap length
    const position = sanitizeSearchParam(searchParams.get('position'));
    const team = sanitizeSearchParam(searchParams.get('team'));
    const playerType: PlayerStatsFilters['playerType'] =
      sanitizeSearchParam(searchParams.get('playerType')) ?? undefined;
    const searchTerm = sanitizeSearchParam(searchParams.get('searchTerm'));

    // Apply batting filters
    if (minHR) filters.minHomeRuns = parseClampedInt(minHR, 'minHomeRuns');
    if (maxHR) filters.maxHomeRuns = parseClampedInt(maxHR, 'maxHomeRuns');
    if (minRBI) filters.minRBI = parseClampedInt(minRBI, 'minRBI');
    if (maxRBI) filters.maxRBI = parseClampedInt(maxRBI, 'maxRBI');
    if (minAVG) filters.minBattingAvg = parseFloat(minAVG);
    if (maxAVG) filters.maxBattingAvg = parseFloat(maxAVG);

    // Apply pitching filters
    if (minERA) filters.minERA = parseFloat(minERA);
    if (maxERA) filters.maxERA = parseFloat(maxERA);
    if (minWins) filters.minWins = parseClampedInt(minWins, 'minWins');
    if (maxWins) filters.maxWins = parseClampedInt(maxWins, 'maxWins');
    if (minSO) filters.minStrikeouts = parseClampedInt(minSO, 'minStrikeouts');
    if (maxSO) filters.maxStrikeouts = parseClampedInt(maxSO, 'maxStrikeouts');

    // Apply player info filters
    if (position) filters.position = position;
    if (team) filters.team = team;
    if (playerType) filters.playerType = playerType;
    if (searchTerm) filters.searchTerm = searchTerm;

    return {
      viewMode,
      pageSize,
      search,
      filters,
    };
  }, [searchParams]);

  const handlePlayerDetails = useCallback(
    (player: PlayerWithStats) => {
      navigate(`/players/${player.id}`);
    },
    [navigate],
  );

  // Handle export functionality
  const handleExport = useCallback(
    (filters: PlayerStatsFilters, viewMode: PlayerStatsViewMode) => {
      // Create export parameters
      const exportData = {
        viewMode,
        filters,
        exportedAt: new Date().toISOString(),
        totalFilters: Object.keys(filters as Record<string, unknown>).length,
      };

      // Create downloadable file
      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);

      // Create download link
      const link = document.createElement('a');
      link.href = url;
      link.download = `player-stats-${viewMode}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      LOGGER.info('Exported player statistics:', exportData);
      setLiveMsg('Player statistics exported. Download started.');
    },
    [],
  );

  // Mirror committed filter state into URL params so reload restores the view.
  // sport is included so shared links preserve the active sport context.
  const handleFiltersChange = useCallback(
    (state: {
      viewMode: PlayerStatsViewMode;
      pageSize: number;
      filters: PlayerStatsFilters;
    }) => {
      setSearchParams(buildStatsSearchParams({ ...state, sport }), {
        replace: true,
      });
    },
    [setSearchParams, sport],
  );

  // Handle share functionality — shared component passes a relative URL; prepend origin here.
  // Sport is appended so the recipient lands on the correct sport variant.
  const handleShare = useCallback(
    (relativeUrl: string) => {
      const [path, qs] = relativeUrl.split('?');
      const params = new URLSearchParams(qs ?? '');
      params.set('sport', sport);
      const url = `${window.location.origin}${path}?${params.toString()}`;
      setLiveMsg('');
      void (async () => {
        try {
          if (navigator.share) {
            await navigator.share({
              title: 'Player Statistics - Legacy Sports',
              text: 'Check out these player statistics from Legacy Sports',
              url: url,
            });
          } else if (navigator.clipboard) {
            await navigator.clipboard.writeText(url);
            setLiveMsg('Link copied to clipboard.');
          } else {
            setLiveMsg('Could not share link. Please copy the URL manually.');
          }
        } catch (error) {
          // AbortError means the user dismissed the native share sheet — not an error
          if (error instanceof Error && error.name === 'AbortError') {
            return;
          }
          LOGGER.error(
            'Error sharing:',
            error instanceof Error ? error : String(error),
          );
          if (navigator.clipboard) {
            try {
              await navigator.clipboard.writeText(url);
              setLiveMsg('Link copied to clipboard.');
            } catch (clipboardError) {
              LOGGER.error(
                'Clipboard error:',
                clipboardError instanceof Error
                  ? clipboardError
                  : String(clipboardError),
              );
              setLiveMsg('Could not share link. Please copy the URL manually.');
            }
          } else {
            setLiveMsg('Could not share link. Please copy the URL manually.');
          }
        }
      })();
    },
    [sport],
  );

  // NFL view — render the football statistics browser inline (LS-8104) instead
  // of redirecting away, so football gets the same on-page stats experience as
  // baseball. Placed after all hooks to satisfy Rules of Hooks.
  if (showFootball) {
    return (
      <div
        style={{
          flex: 1,
          backgroundColor: `var(--background, ${BG_DARK})`,
          color: `var(--color, ${TEXT_HIGH_CONTRAST})`,
          padding: 0,
        }}
      >
        <StatsSportSwitcher
          active="nfl"
          onSelectMlb={() => handleSelectSport('mlb')}
          onSelectNfl={() => handleSelectSport('nfl')}
        />
        <Suspense
          fallback={
            <div
              role="status"
              aria-live="polite"
              style={{ padding: '2rem', textAlign: 'center' }}
            >
              Loading NFL statistics…
            </div>
          }
        >
          <FootballPlayersPageLazy />
        </Suspense>
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        backgroundColor: `var(--background, ${BG_DARK})`,
        color: `var(--color, ${TEXT_HIGH_CONTRAST})`,
        padding: 0, // Remove default padding as PlayerStatsPage handles its own
      }}
    >
      <PageMeta
        title="Player Statistics"
        description="Browse career and season statistics for every MLB player available in your Legacy Sports fantasy league."
      />
      <div className="sr-only" aria-live="polite">
        {liveMsg}
      </div>
      {/* Visible toast confirmation — paired with the sr-only live region above.
          Crossfade-only animation honors prefers-reduced-motion. */}
      <style>{`
        @keyframes ls-stats-toast-in {
          from { opacity: 0; transform: translate(-50%, 8px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .ls-stats-toast { animation: ls-stats-toast-fade 180ms ease forwards; }
        }
        @keyframes ls-stats-toast-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
      {liveMsg && (
        <div
          className="ls-stats-toast"
          role="status"
          style={{
            position: 'fixed',
            bottom: 28,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 60,
            background: SURFACE_CARD,
            border: `1px solid ${withAlpha(BRAND_GOLD, 0.4)}`,
            borderRadius: 9999,
            padding: '12px 20px 12px 16px',
            color: BRAND_GOLD_LIGHT,
            fontFamily: "'Literata', serif",
            fontSize: 14,
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.35)',
            animation: 'ls-stats-toast-in 180ms ease forwards',
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke={BRAND_GOLD}
            strokeWidth="2"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {liveMsg}
        </div>
      )}
      {footballEnabled !== false && (
        <StatsSportSwitcher
          active="mlb"
          onSelectMlb={() => handleSelectSport('mlb')}
          onSelectNfl={() => handleSelectSport('nfl')}
        />
      )}
      <PremiumGate
        isPremium={isPremium}
        featureName="Player Statistics & Projections"
        featureDescription="Unlock advanced player statistics, projected fantasy points, ADP rankings, and injury-status filters with Premium."
      >
        <PlayerStatsPage
          title="MLB Player Statistics"
          initialViewMode={initialState.viewMode}
          initialFilters={initialState.filters}
          initialPageSize={initialState.pageSize}
          showHeader={true}
          showActions={true}
          statsFormat={statsFormat}
          onPlayerDetails={handlePlayerDetails}
          onExport={handleExport}
          onShare={handleShare}
          onFiltersChange={handleFiltersChange}
          showAvailabilityFilter={hasBaseballLeagues}
          rosteredPlayerIds={baseballRosteredIds}
        />
      </PremiumGate>
    </div>
  );
}

/**
 * Player Detail Page
 *
 * Handles both `/players/:id` (numeric) and `/players/:brefid` (Baseball
 * Reference ID string) — React Router matches both to the same `:id` param.
 * When the param is non-numeric we resolve it via `playerByBrefId` first.
 */
export function PlayerDetailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: identifier } = useParams<{ id: string }>();
  const isPremium = useHasEntitlement(ENTITLEMENTS.advanced_search_filters);

  const isNumeric = !!identifier && /^\d+$/.test(identifier);
  const parsedNumericId = isNumeric ? Number(identifier) : null;
  const isValidNumericId =
    parsedNumericId !== null &&
    Number.isSafeInteger(parsedNumericId) &&
    parsedNumericId > 0 &&
    parsedNumericId <= MAX_GRAPHQL_INT;
  const numericId = isValidNumericId ? parsedNumericId : null;
  const brefId = !isNumeric ? (identifier?.trim().toLowerCase() ?? null) : null;

  const {
    data: brefData,
    loading: brefLoading,
    error: brefError,
  } = useGetPlayerIdByBrefIdQuery({
    variables: { brefId: brefId ?? '' },
    skip: !brefId,
  });

  const resolvedId = isNumeric
    ? numericId
    : (brefData?.playerByBrefId?.id ?? null);

  const resolvedName =
    [brefData?.playerByBrefId?.firstName, brefData?.playerByBrefId?.lastName]
      .filter(Boolean)
      .join(' ') || 'Player details';

  useEffect(() => {
    if (brefError) {
      LOGGER.error('[PlayerDetailPage] brefId lookup error:', brefError);
    }
  }, [brefError]);

  useEffect(() => {
    if (isNumeric && !isValidNumericId) {
      LOGGER.warn('[PlayerDetailPage] invalid id', { identifier });
    }
  }, [isNumeric, isValidNumericId, identifier]);

  useEffect(() => {
    if (brefId && identifier && identifier !== brefId) {
      navigate(`/players/${brefId}`, { replace: true });
    }
  }, [brefId, identifier, navigate]);

  const handleBack = useCallback(() => {
    if (location.key !== 'default') {
      navigate(-1);
    } else {
      navigate('/players/stats', { replace: true });
    }
  }, [navigate, location.key]);

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: `var(--background, ${BG_DARK})`,
        color: `var(--color, ${TEXT_HIGH_CONTRAST})`,
        padding: '2rem',
      }}
    >
      <PageMeta
        title="Player Profile"
        description="View detailed career statistics and performance history for this baseball player on Legacy Sports."
      />
      <button
        className="player-back-btn"
        onClick={handleBack}
        style={{
          marginBottom: '1rem',
          padding: '0.5rem 1rem',
          backgroundColor: BRAND_NAVY_LIGHT,
          color: WHITE,
          border: '1px solid rgba(197,165,90,0.2)',
          borderRadius: '6px',
          cursor: 'pointer',
          fontWeight: 600,
          fontFamily: "'Big Shoulders Display', sans-serif",
          letterSpacing: '0.3px',
        }}
      >
        ← Back
      </button>

      {brefLoading && (
        <div
          role="status"
          aria-live="polite"
          style={{
            padding: '2rem',
            textAlign: 'center',
            color: TEXT_HIGH_CONTRAST,
          }}
        >
          Loading player…
        </div>
      )}

      {brefError && (
        <div
          role="alert"
          style={{
            padding: '1rem',
            backgroundColor: withAlpha(BRAND_SEAM_RED, 0.12),
            border: `1px solid ${BRAND_SEAM_RED}`,
            borderRadius: '6px',
            color: BRAND_SEAM_RED,
            marginBottom: '1rem',
          }}
        >
          Error loading player. Please try again.
        </div>
      )}

      {isNumeric && !isValidNumericId && (
        <div
          role="alert"
          style={{
            padding: '1rem',
            backgroundColor: withAlpha(BRAND_SEAM_RED, 0.12),
            border: `1px solid ${BRAND_SEAM_RED}`,
            borderRadius: '6px',
            color: BRAND_SEAM_RED,
            marginBottom: '1rem',
          }}
        >
          Invalid player ID &ldquo;{identifier}&rdquo;.
        </div>
      )}

      {!brefLoading &&
        !brefError &&
        !resolvedId &&
        (isValidNumericId || brefId) && (
          <div
            role="alert"
            style={{
              padding: '1rem',
              backgroundColor: withAlpha(BRAND_SEAM_RED, 0.12),
              border: `1px solid ${BRAND_SEAM_RED}`,
              borderRadius: '6px',
              color: BRAND_SEAM_RED,
              marginBottom: '1rem',
            }}
          >
            {brefId
              ? `No player found with Baseball Reference ID "${brefId}".`
              : `No player found for ID "${identifier}".`}
          </div>
        )}

      {resolvedId !== null &&
        !brefError &&
        (isPremium ? (
          <PlayerDetailModal
            open={true}
            onOpenChange={(open) => {
              if (!open) handleBack();
            }}
            playerId={resolvedId}
            playerName={resolvedName}
          />
        ) : (
          // Free users: the detail modal renders its content in a Dialog portal
          // (outside any wrapper), so gating the modal directly would leak the
          // stats. Instead render an inline, non-portal panel behind PremiumGate
          // so the blur + upgrade CTA actually cover the career-stats surface.
          <PremiumGate
            isPremium={false}
            featureName="Player Career Stats"
            featureDescription="Unlock full career statistics, season-by-season splits, and advanced metrics for every player."
          >
            <div
              style={{
                minHeight: 360,
                borderRadius: '16px',
                border: `1px solid ${withAlpha(BRAND_GOLD, 0.25)}`,
                backgroundColor: SURFACE_CARD,
                padding: '2rem',
              }}
            >
              <h1
                style={{
                  fontFamily: "'Big Shoulders Display', sans-serif",
                  color: WHITE,
                  margin: 0,
                }}
              >
                {resolvedName}
              </h1>
              <p
                style={{
                  fontFamily: "'Literata', serif",
                  color: TEXT_HIGH_CONTRAST,
                  marginTop: '0.75rem',
                }}
              >
                Career statistics — season-by-season batting, pitching, and
                fielding splits — are a Premium feature.
              </p>
            </div>
          </PremiumGate>
        ))}
    </div>
  );
}
