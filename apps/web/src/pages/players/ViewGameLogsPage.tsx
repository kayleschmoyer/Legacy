import React from 'react';
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
 */
const STATS_API_BASE =
  config.statsApiUrl?.replace(/\/+$/, '') ?? 'http://localhost:5000';
const GAME_LOGS_ENDPOINT = `${STATS_API_BASE}/baseball-game-logs`;

export function ViewGameLogsPage() {
  const isPremium = useIsPremium();
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
        />
      </PremiumGate>
    </div>
  );
}

export default ViewGameLogsPage;
