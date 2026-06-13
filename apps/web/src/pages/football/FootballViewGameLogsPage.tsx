import React from 'react';
import { GameLogsTable } from '@legacy-sports/shared-components/stats';
import { config } from '@legacy-sports/app-config/web';
import { PageMeta } from '../../components/PageMeta';
import { BG_DARK, TEXT_HIGH_CONTRAST } from '../../constants/colors';

const STATS_API_BASE =
  config.statsApiUrl?.replace(/\/+$/, '') ?? 'http://localhost:5000';
const FOOTBALL_GAME_LOGS_ENDPOINT = `${STATS_API_BASE}/nfl-game-logs`;

export function FootballViewGameLogsPage() {
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
      <GameLogsTable apiEndpoint={FOOTBALL_GAME_LOGS_ENDPOINT} sport="nfl" />
    </div>
  );
}

export default FootballViewGameLogsPage;
