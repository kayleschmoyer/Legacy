import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { GameLogsTable } from '@legacy-sports/shared-components/stats';
import { config } from '@legacy-sports/app-config/web';
import { PageMeta } from '../../components/PageMeta';
import { PremiumGate } from '../../components/PremiumGate';
import { useIsPremium } from '../../hooks/useIsPremium';
import { BG_DARK, TEXT_HIGH_CONTRAST } from '../../constants/colors';

/**
 * View Game Logs page — mounts the shared {@link GameLogsTable} so the combined
 * player + date + opponent + home/away filter state posts to the stats API as a
 * single request body (LS-7466). The filter state machine and payload shaping
 * live in the shared component; this route only wires the API endpoint and page
 * chrome so the feature is reachable at `/players/view-game-logs`.
 *
 * The stats API base comes from VITE_STATS_API_URL (via app-config), falling
 * back to the local dev stats service. Hardening this fallback for release
 * builds is tracked separately under LS-7691.
 *
 * Accepts optional `playerId` / `startDate` / `endDate` query params to
 * deep-link straight to a specific player + date range — e.g. from the On
 * This Day widget's game-specific navigation (LS-9763).
 *
 * This page is `PremiumGate`d, but the On This Day widget that links here is
 * shown to free and logged-out users too. Deliberately no special-casing for
 * that: a free/logged-out user who clicks an entry lands here and sees the
 * same premium gate as any other visitor hitting this URL directly, rather
 * than the widget silently no-oping or routing them somewhere else. That
 * keeps the gate the single source of truth for premium access and avoids
 * a second, inconsistent gating path in the widget itself.
 */
const STATS_API_BASE =
  config.statsApiUrl?.replace(/\/+$/, '') ?? 'http://localhost:5000';
const GAME_LOGS_ENDPOINT = `${STATS_API_BASE}/baseball-game-logs`;

export function ViewGameLogsPage() {
  const isPremium = useIsPremium();
  const [searchParams] = useSearchParams();
  const initialPlayerId = searchParams.get('playerId') ?? undefined;
  const initialStartDate = searchParams.get('startDate') ?? undefined;
  const initialEndDate = searchParams.get('endDate') ?? undefined;
  return (
    <div
      style={{
        flex: 1,
        backgroundColor: `var(--background, ${BG_DARK})`,
        color: `var(--color, ${TEXT_HIGH_CONTRAST})`,
      }}
    >
      <PageMeta
        title="View Game Logs"
        description="Filter an MLB player's game-by-game logs by date, opponent, and home/away venue."
      />
      <PremiumGate isPremium={isPremium} featureName="Game Logs">
        <GameLogsTable
          apiEndpoint={GAME_LOGS_ENDPOINT}
          sport="mlb"
          isPremium={isPremium}
          initialPlayerId={initialPlayerId}
          initialStartDate={initialStartDate}
          initialEndDate={initialEndDate}
        />
      </PremiumGate>
    </div>
  );
}

export default ViewGameLogsPage;
