import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import {
  GameLogsTable,
  useGameLogsPlayerName,
} from '@legacy-sports/shared-components/stats';
import { config } from '@legacy-sports/app-config/native';
import { PremiumGate } from '../../../../features/subscription/PremiumGate';
import { useSubscription } from '../../../../features/subscription/useSubscription';

const STATS_API_BASE = config.statsApiUrl?.replace(/\/+$/, '') ?? '';
const GAME_LOGS_ENDPOINT = STATS_API_BASE
  ? `${STATS_API_BASE}/baseball-game-logs`
  : undefined;

/**
 * Mobile equivalent of web's `ViewGameLogsPage` (LS-10015, follow-up to
 * LS-9763). `GameLogsTable` from shared-components already renders correctly
 * on native — it branches internally on `Platform.OS` for its date inputs and
 * virtualized body — so this screen only supplies mobile navigation params and
 * subscription-gating, mirroring the web wrapper.
 *
 * Accepts optional `playerId` / `startDate` / `endDate` route params to
 * deep-link straight to a specific player + date range — e.g. from the On
 * This Day widget's game-specific navigation (LS-9763 / LS-10015). A
 * deep-linked player is shown by name rather than the raw bref id, and a
 * player + date range fetches on arrival (LS-10661).
 *
 * This screen is `PremiumGate`d, but the On This Day widget that links here is
 * shown to free users too (mobile's `(app)` group requires sign-in, so a
 * logged-out user never reaches it — see `(app)/_layout.tsx`). Deliberately no
 * special-casing for that: a free user who taps an entry lands here and sees
 * the same premium gate as any other visitor navigating here directly,
 * matching web's design decision documented on `ViewGameLogsPage.tsx`.
 */
export default function ViewGameLogsScreen() {
  const { isPremium } = useSubscription();
  const { playerId, startDate, endDate } = useLocalSearchParams<{
    playerId?: string;
    startDate?: string;
    endDate?: string;
  }>();
  const playerName = useGameLogsPlayerName(playerId);

  return (
    <PremiumGate isPremium={isPremium} featureName="Game Logs" fill>
      <GameLogsTable
        apiEndpoint={GAME_LOGS_ENDPOINT}
        sport="mlb"
        isPremium={isPremium}
        initialPlayerId={playerId}
        initialStartDate={startDate}
        initialEndDate={endDate}
        playerName={playerName}
      />
    </PremiumGate>
  );
}
export { ScreenErrorBoundary as ErrorBoundary } from '../../_screenErrorBoundary';
