import React from 'react';
import { GameLogsTable } from '@legacy-sports/shared-components/stats';
import { config } from '@legacy-sports/app-config/web';
import { PageMeta } from '../../components/PageMeta';
import { PremiumGate } from '../../components/PremiumGate';
import { useIsPremium } from '../../hooks/useIsPremium';
import { BG_DARK, TEXT_HIGH_CONTRAST } from '../../constants/colors';

const STATS_API_BASE = config.statsApiUrl?.replace(/\/+$/, '');
// No localhost fallback: GameLogsTable supplies a dev-only default and renders
// an unavailable notice in production when this is undefined (LS-10494).
const FOOTBALL_GAME_LOGS_ENDPOINT = STATS_API_BASE
  ? `${STATS_API_BASE}/nfl-game-logs`
  : undefined;

export function FootballViewGameLogsPage() {
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
        title="Football Game Logs"
        description="Filter an NFL player's per-game logs by date, opponent, and home/away venue."
      />
      <PremiumGate isPremium={isPremium} featureName="Football Game Logs">
        <GameLogsTable
          apiEndpoint={FOOTBALL_GAME_LOGS_ENDPOINT}
          sport="nfl"
          isPremium={isPremium}
        />
      </PremiumGate>
    </div>
  );
}

export default FootballViewGameLogsPage;
