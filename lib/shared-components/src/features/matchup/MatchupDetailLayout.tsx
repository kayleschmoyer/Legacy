import React, { type ReactNode } from 'react';
import { Text, YStack } from 'tamagui';
import { type MatchupFragment } from '@legacy-sports/graphql';
import { GamesRemaining } from './GamesRemaining';
import { MatchupNavigationControls } from './MatchupNavigationControls';

export interface MatchupDetailLayoutProps {
  matchup: MatchupFragment;
  leagueId: number;
  userTeamId?: number | null;
  allMatchups?: MatchupFragment[];
  currentWeek?: number;
  isViewingOther?: boolean;
  onMatchupChange: (matchupId: string) => void;
  onResetToDefault?: () => void;
  /** Optional header slot rendered before navigation controls (e.g. page title + back button on web) */
  header?: ReactNode;
  /** Platform-specific scoreboard (platform supplies data layer) */
  scoreboard: ReactNode;
  /** Platform-specific win probability panel; wrap in PremiumGate if needed */
  winProbabilityPanel?: ReactNode;
  /** Platform-specific roster editor; platform handles ownership/status guards */
  rosterEditor?: ReactNode;
  /** Narrative recap; wrap in PremiumGate and guard on Completed status if needed */
  recapPanel?: ReactNode;
  /** Platform-specific roster comparison */
  rosterComparison?: ReactNode;
}

function formatMatchupTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

/**
 * MatchupDetailLayout — shared section structure for matchup detail screens.
 *
 * Renders sections in a consistent order on both web and mobile. Platforms
 * supply platform-specific sub-components via render slots; shared components
 * (navigation controls, games progress, matchup info) are rendered internally.
 *
 * Section order:
 *   1. header (optional)
 *   2. MatchupNavigationControls
 *   3. scoreboard
 *   4. winProbabilityPanel
 *   5. GamesRemaining (when gamesPerMatchup > 0)
 *   6. Matchup information (start/end times)
 *   7. rosterEditor
 *   8. recapPanel
 *   9. rosterComparison
 */
export function MatchupDetailLayout({
  matchup,
  leagueId,
  userTeamId,
  allMatchups = [],
  currentWeek,
  isViewingOther = false,
  onMatchupChange,
  onResetToDefault,
  header,
  scoreboard,
  winProbabilityPanel,
  rosterEditor,
  recapPanel,
  rosterComparison,
}: MatchupDetailLayoutProps) {
  const totalGames = matchup.gamesPerMatchup ?? 0;
  const selectedGamesCount = matchup.selectedGamesCount ?? 0;
  const gamesRemaining = Math.min(
    Math.max(totalGames - selectedGamesCount, 0),
    totalGames,
  );

  const hasMatchupTimes = matchup.startTime != null || matchup.endTime != null;

  return (
    <YStack
      role="main"
      aria-label="Matchup details"
      width="100%"
      maxWidth={1200}
      alignSelf="center"
      padding="$4"
      $sm={{ padding: '$2' }}
      space="$4"
    >
      {header}

      <MatchupNavigationControls
        currentMatchup={matchup}
        leagueId={leagueId}
        allMatchups={allMatchups}
        currentLeagueWeek={currentWeek}
        userTeamId={userTeamId}
        isViewingOther={isViewingOther}
        onMatchupChange={onMatchupChange}
        onResetToDefault={onResetToDefault}
      />

      {scoreboard}

      {winProbabilityPanel}

      {totalGames > 0 && (
        <GamesRemaining
          gamesRemaining={gamesRemaining}
          totalGames={totalGames}
        />
      )}

      {hasMatchupTimes && (
        <YStack space="$2">
          <Text fontSize="$4" fontWeight="bold">
            Matchup Information
          </Text>
          <YStack space="$1">
            {matchup.startTime != null && (
              <Text fontSize="$3" color="$gray11">
                Start: {formatMatchupTimestamp(matchup.startTime)}
              </Text>
            )}
            {matchup.endTime != null && (
              <Text fontSize="$3" color="$gray11">
                End: {formatMatchupTimestamp(matchup.endTime)}
              </Text>
            )}
          </YStack>
        </YStack>
      )}

      {rosterEditor}

      {recapPanel}

      {rosterComparison}
    </YStack>
  );
}
