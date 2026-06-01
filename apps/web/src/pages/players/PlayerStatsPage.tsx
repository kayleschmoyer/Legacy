import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import {
  type PlayerStatsViewMode,
  PlayerStatsPage as SharedPlayerStatsPage,
} from '@legacy-sports/shared-components/players';
import type {
  PlayerStatsFilters,
  PlayerWithStats,
} from '@legacy-sports/shared-components/players';
import { LOGGER } from '@legacy-sports/logging';
import { PageMeta } from '../../components/PageMeta';
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
import { useGetPlayerIdByBrefIdQuery } from '../../api/db/graphql.generated';

// GraphQL Int is a 32-bit signed integer — clamp URL param values to prevent query errors
const MAX_GRAPHQL_INT = 2147483647;

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
}): URLSearchParams {
  const next = new URLSearchParams();
  next.set('view', state.viewMode);
  next.set('pageSize', String(state.pageSize));
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
  return next;
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

export function PlayerStatsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [liveMsg, setLiveMsg] = React.useState('');

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

  // Player detail modal state
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<{
    id: number;
    name: string;
  } | null>(null);

  // Parse URL parameters for initial state
  const initialState = useMemo(() => {
    const viewMode =
      (searchParams.get('view') as PlayerStatsViewMode) || 'combined';
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

    // Player info filters
    const position = searchParams.get('position');
    const team = searchParams.get('team');
    const playerType = searchParams.get(
      'playerType',
    ) as PlayerStatsFilters['playerType'];
    const searchTerm = searchParams.get('searchTerm');

    // Apply batting filters
    if (minHR)
      filters.minHomeRuns = Math.min(parseInt(minHR, 10), MAX_GRAPHQL_INT);
    if (maxHR)
      filters.maxHomeRuns = Math.min(parseInt(maxHR, 10), MAX_GRAPHQL_INT);
    if (minRBI)
      filters.minRBI = Math.min(parseInt(minRBI, 10), MAX_GRAPHQL_INT);
    if (maxRBI)
      filters.maxRBI = Math.min(parseInt(maxRBI, 10), MAX_GRAPHQL_INT);
    if (minAVG) filters.minBattingAvg = parseFloat(minAVG);
    if (maxAVG) filters.maxBattingAvg = parseFloat(maxAVG);

    // Apply pitching filters
    if (minERA) filters.minERA = parseFloat(minERA);
    if (maxERA) filters.maxERA = parseFloat(maxERA);
    if (minWins)
      filters.minWins = Math.min(parseInt(minWins, 10), MAX_GRAPHQL_INT);
    if (maxWins)
      filters.maxWins = Math.min(parseInt(maxWins, 10), MAX_GRAPHQL_INT);
    if (minSO)
      filters.minStrikeouts = Math.min(parseInt(minSO, 10), MAX_GRAPHQL_INT);
    if (maxSO)
      filters.maxStrikeouts = Math.min(parseInt(maxSO, 10), MAX_GRAPHQL_INT);

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

  // Handle player detail — open modal instead of navigating
  const handlePlayerDetails = useCallback((player: PlayerWithStats) => {
    setSelectedPlayer({
      id: typeof player.id === 'string' ? parseInt(player.id, 10) : player.id,
      name: player.name,
    });
    setDetailModalOpen(true);
  }, []);

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
  const handleFiltersChange = useCallback(
    (state: {
      viewMode: PlayerStatsViewMode;
      pageSize: number;
      filters: PlayerStatsFilters;
    }) => {
      setSearchParams(buildStatsSearchParams(state), { replace: true });
    },
    [setSearchParams],
  );

  // Handle share functionality — shared component passes a relative URL; prepend origin here
  const handleShare = useCallback((relativeUrl: string) => {
    const url = `${window.location.origin}${relativeUrl}`;
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
  }, []);

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
      <SharedPlayerStatsPage
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
      />

      {/* Player detail modal */}
      <PlayerDetailModal
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        playerId={selectedPlayer?.id ?? null}
        playerName={selectedPlayer?.name ?? ''}
      />
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
      LOGGER.error(
        '[PlayerDetailPage] brefId lookup error:',
        brefError.message,
      );
    }
  }, [brefError]);

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
        description="View detailed career statistics and performance history for this MLB player on Legacy Sports."
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

      {resolvedId !== null && !brefError && (
        <PlayerDetailModal
          open={true}
          onOpenChange={(open) => {
            if (!open) handleBack();
          }}
          playerId={resolvedId}
          playerName={resolvedName}
        />
      )}
    </div>
  );
}
