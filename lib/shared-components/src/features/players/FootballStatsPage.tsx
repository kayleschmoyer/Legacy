import React from 'react';
import { PlayerStatsShell } from './shell/PlayerStatsShell';
import {
  type FootballStatsPageProps,
  useFootballController,
} from './football/footballStatsConfig';

/**
 * Player Statistics Page (NFL).
 *
 * Thin binding of the football controller to the sport-agnostic
 * {@link PlayerStatsShell}. All football filter state, cursor pagination, the
 * data grid, and share live in {@link useFootballController}; all presentational
 * chrome lives in the shared shell — the same shell the MLB stats browser renders
 * through (LS-8442).
 */
export function FootballStatsPage(props: FootballStatsPageProps) {
  const controller = useFootballController(props);
  return (
    <PlayerStatsShell
      controller={controller}
      showHeader={props.showHeader ?? true}
      showActions={props.showActions ?? true}
    />
  );
}

export type { FootballStatsPageProps } from './football/footballStatsConfig';
