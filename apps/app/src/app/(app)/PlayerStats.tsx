import React, { useCallback, useMemo } from 'react';
import { Share } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  type PlayerStatsFilters,
  PlayerStatsPage,
  type PlayerStatsViewMode,
  type PlayerWithStats,
} from '@legacy-sports/shared-components';
import { LOGGER } from '@legacy-sports/logging';
import { config } from '@legacy-sports/app-config/native';
import { PremiumGate } from '../../features/subscription/PremiumGate';
import { useSubscription } from '../../features/subscription/useSubscription';

// Web origin used to turn the shared component's relative share path into a
// fully-qualified deep link (matches the SalaryCapManagementCard pattern).
const APP_BASE_URL = config.appBaseUrl ?? 'https://legacysports.app';

// GraphQL Int is a 32-bit signed integer — clamp param values to prevent query
// errors (mirrors the web wrapper's MAX_GRAPHQL_INT guard).
const MAX_GRAPHQL_INT = 2147483647;

const SEARCH_PARAM_MAX_LENGTH = 64;

const VIEW_MODES: ReadonlySet<PlayerStatsViewMode> = new Set([
  'batting',
  'pitching',
  'fielding',
  'combined',
  'hitters',
  'pitchers',
]);

/**
 * Read a single expo-router search param value. expo-router returns
 * `string | string[]` per key; take the first element of arrays and reject
 * non-string shapes so downstream parsing never sees an array.
 */
function firstParam(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' ? value : null;
}

/**
 * Sanitize a URL search parameter value before forwarding to filters. Strips
 * control characters (U+0000–U+001F, U+007F–U+009F) and enforces a maximum
 * length. Mirrors the web wrapper's `sanitizeSearchParam` so iOS/Android and
 * web hydrate from a shared link identically.
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
 * Parse expo-router search params into the shared component's initial state.
 * Mirrors the web wrapper's URL parsing (LS-7143) so filter state hydrates the
 * same way on iOS/Android — surviving app backgrounding, expo-router state
 * replacement, and process kill, and making shared links cross-platform.
 * Exported for unit testing.
 */
export function parseStatsParams(params: Record<string, string | string[]>): {
  viewMode: PlayerStatsViewMode;
  pageSize: number;
  filters: Partial<PlayerStatsFilters>;
} {
  const rawView = firstParam(params.view);
  const viewMode: PlayerStatsViewMode =
    rawView && VIEW_MODES.has(rawView as PlayerStatsViewMode)
      ? (rawView as PlayerStatsViewMode)
      : 'combined';

  const rawPageSize = firstParam(params.pageSize);
  const parsedPageSize = rawPageSize ? parseInt(rawPageSize, 10) : NaN;
  const pageSize = Number.isFinite(parsedPageSize) ? parsedPageSize : 25;

  const filters: Partial<PlayerStatsFilters> = {};

  const searchTerm = sanitizeSearchParam(firstParam(params.searchTerm));
  const position = sanitizeSearchParam(firstParam(params.position));
  const team = sanitizeSearchParam(firstParam(params.team));
  const minHomeRuns = firstParam(params.minHomeRuns);
  const minBattingAvg = firstParam(params.minBattingAvg);
  const maxERA = firstParam(params.maxERA);

  if (searchTerm) filters.searchTerm = searchTerm;
  if (position) filters.position = position;
  if (team) filters.team = team;
  // Guard against NaN from non-numeric params (e.g. a hand-edited link); only
  // assign finite values so NaN never reaches a filter or GraphQL variable.
  if (minHomeRuns) {
    const parsed = parseInt(minHomeRuns, 10);
    if (Number.isFinite(parsed)) {
      filters.minHomeRuns = Math.min(parsed, MAX_GRAPHQL_INT);
    }
  }
  if (minBattingAvg) {
    const parsed = parseFloat(minBattingAvg);
    if (Number.isFinite(parsed)) filters.minBattingAvg = parsed;
  }
  if (maxERA) {
    const parsed = parseFloat(maxERA);
    if (Number.isFinite(parsed)) filters.maxERA = parsed;
  }

  return { viewMode, pageSize, filters };
}

/**
 * Build the expo-router param set from a committed filter snapshot. Numeric
 * formatting matches the web URL param contract (3 decimals for AVG, 2 for ERA)
 * so a link shared from mobile opens identically on web.
 *
 * `router.setParams` shallow-merges (it cannot delete keys), so every persisted
 * key is written explicitly — cleared filters are written as `''` to overwrite
 * a previously-set value rather than leaving it stranded in the URL. Exported
 * for unit testing.
 */
export function buildStatsParams(state: {
  viewMode: PlayerStatsViewMode;
  pageSize: number;
  filters: PlayerStatsFilters;
}): Record<string, string> {
  return {
    view: state.viewMode,
    pageSize: String(state.pageSize),
    searchTerm: state.filters.searchTerm ?? '',
    position: state.filters.position ?? '',
    team: state.filters.team ?? '',
    minHomeRuns:
      state.filters.minHomeRuns !== undefined
        ? String(state.filters.minHomeRuns)
        : '',
    minBattingAvg:
      state.filters.minBattingAvg !== undefined
        ? state.filters.minBattingAvg.toFixed(3)
        : '',
    maxERA:
      state.filters.maxERA !== undefined ? state.filters.maxERA.toFixed(2) : '',
  };
}

/**
 * Mobile Player Statistics Screen
 *
 * Wraps the shared {@link PlayerStatsPage} with mobile navigation and
 * native-appropriate export/share. Tapping a player navigates to the
 * PlayerDetail screen via Expo Router; the shared component owns the filter,
 * sort, and premium-column UI so native stays at parity with web (LS-7806).
 */
export default function PlayerStatsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { isPremium } = useSubscription();

  // Hydrate initial filter/view/page state from the expo-router search params so
  // the view is restored after app backgrounding, expo-router state replacement,
  // or process kill, and so a link shared from web/mobile opens pre-filtered
  // (LS-7143). Only seeds the shared component's initial state — subsequent
  // setParams writes do not re-hydrate, matching the web wrapper's one-way flow.
  const initialState = useMemo(() => parseStatsParams(params), [params]);

  // Mirror committed filter state back into expo-router params so it persists
  // across navigation/backgrounding and is shareable (LS-7143). Matches the web
  // wrapper's `setSearchParams(..., { replace: true })` round-trip.
  const handleFiltersChange = useCallback(
    (state: {
      viewMode: PlayerStatsViewMode;
      pageSize: number;
      filters: PlayerStatsFilters;
    }) => {
      router.setParams(buildStatsParams(state));
    },
    [router],
  );

  const handlePlayerDetails = useCallback(
    (player: PlayerWithStats) => {
      router.push({
        pathname: '/PlayerDetail',
        params: { playerId: String(player.id), playerName: player.name },
      });
    },
    [router],
  );

  // Share the current view as a deep link via the native share sheet so a
  // teammate can open the same filtered stats on the web app.
  const handleShare = useCallback(async (url: string) => {
    const fullUrl = `${APP_BASE_URL}${url}`;
    try {
      const result = await Share.share({
        message: `Player stats on Legacy Sports\n\n${fullUrl}`,
        title: 'Player Statistics',
        url: fullUrl,
      });
      if (result.action === Share.dismissedAction) {
        // User dismissed the sheet without sharing. Nothing downstream depends
        // on success, but log it so completed shares and cancellations are
        // distinguishable (matches BaseballHome.shareLeagueInvite).
        LOGGER.debug('Player stats share dismissed by user');
      }
    } catch (error: unknown) {
      LOGGER.error(
        'Error while sharing player statistics link',
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }, []);

  // Export the active filter snapshot as JSON through the share sheet (native
  // has no file-download affordance; the share sheet routes to Files/clipboard/
  // messaging per the user's choice).
  const handleExport = useCallback(
    async (filters: PlayerStatsFilters, viewMode: PlayerStatsViewMode) => {
      const payload = JSON.stringify({ viewMode, filters }, null, 2);
      try {
        const result = await Share.share({
          message: payload,
          title: 'Player Statistics Export',
        });
        if (result.action === Share.dismissedAction) {
          LOGGER.debug('Player stats export dismissed by user');
        }
      } catch (error: unknown) {
        LOGGER.error(
          'Error while exporting player statistics',
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    },
    [],
  );

  return (
    <PremiumGate isPremium={isPremium} featureName="Player Statistics">
      <PlayerStatsPage
        initialViewMode={initialState.viewMode}
        initialFilters={initialState.filters}
        initialPageSize={initialState.pageSize}
        onPlayerDetails={handlePlayerDetails}
        onShare={(url) => void handleShare(url)}
        onExport={(filters, viewMode) => void handleExport(filters, viewMode)}
        onFiltersChange={handleFiltersChange}
        showHeader={true}
        showActions={true}
        statsFormat="expanded"
      />
    </PremiumGate>
  );
}
export { ScreenErrorBoundary as ErrorBoundary } from './_screenErrorBoundary';
