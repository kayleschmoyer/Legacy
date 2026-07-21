import React, { useCallback } from 'react';
import { ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text, YStack } from 'tamagui';
import {
  MatchupDetailLayout,
  MatchupDetailSkeleton,
  MatchupRecapPanel,
} from '@legacy-sports/shared-components/matchup';
import { MatchupRosterComparison } from '@legacy-sports/shared-components';
import { ENTITLEMENTS } from '@legacy-sports/utils';
import { MatchupStatus, useGetUserTeamIdQuery } from '@legacy-sports/graphql';
import { MatchupRosterEditor } from '../components/MatchupRosterEditor';
import { MatchupScoreboard } from '../components/MatchupScoreboard';
import { MatchupWinProbabilityPanel } from '../components/MatchupWinProbabilityPanel';
import { PremiumGate } from '../../subscription/PremiumGate';
import { useHasEntitlement } from '../../subscription/useSubscription';
import {
  useCurrentWeek,
  useMatchupById,
  useMatchupsForLeague,
} from '../hooks/useMatchup';
import { toIntId } from '../../../common/utilities/RouteUtils';

export default function MatchupDetailScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();

  const matchupId = toIntId(params.matchupId);
  const leagueId = toIntId(params.leagueId);

  const {
    matchup,
    loading: matchupLoading,
    error: matchupError,
  } = useMatchupById(matchupId);
  const { currentWeek } = useCurrentWeek(leagueId);
  const { matchups: allMatchups } = useMatchupsForLeague(leagueId);
  const { data: userTeamData } = useGetUserTeamIdQuery({
    variables: { leagueId: leagueId ?? 0 },
    skip: !leagueId,
  });
  const userTeamId = userTeamData?.userTeamId ?? null;
  const canSeeProjections = useHasEntitlement(ENTITLEMENTS.matchup_projections);
  const canSeeRecap = useHasEntitlement(ENTITLEMENTS.ai_matchup_recap);

  const handleMatchupChange = useCallback(
    (newMatchupId: string) => {
      const numericId = parseInt(newMatchupId, 10);
      if (!isNaN(numericId) && leagueId) {
        router.navigate(
          `/baseball/matchup?matchupId=${numericId}&leagueId=${leagueId}`,
        );
      }
    },
    [router, leagueId],
  );

  if (matchupLoading) {
    return (
      <ScrollView>
        <MatchupDetailSkeleton />
      </ScrollView>
    );
  }

  if (matchupError) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" padding="$4">
        <Text color="$red10">Error loading matchup</Text>
        <Text color="$gray11" marginTop="$2">
          {matchupError.message}
        </Text>
      </YStack>
    );
  }

  if (!matchup) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" padding="$4">
        <Text color="$gray11">Matchup not found</Text>
      </YStack>
    );
  }

  if (leagueId == null) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" padding="$4">
        <Text color="$gray11">Invalid league</Text>
      </YStack>
    );
  }

  const gamesTotal = matchup.gamesPerMatchup ?? 0;
  const selectedGamesCount = matchup.selectedGamesCount ?? 0;
  const gamesRemaining = Math.min(
    Math.max(gamesTotal - selectedGamesCount, 0),
    gamesTotal,
  );

  const isUserInMatchup =
    userTeamId != null &&
    (matchup.team1Id === userTeamId || matchup.team2Id === userTeamId);

  return (
    <ScrollView>
      <MatchupDetailLayout
        matchup={matchup}
        leagueId={leagueId}
        userTeamId={userTeamId}
        allMatchups={allMatchups}
        currentWeek={currentWeek ?? undefined}
        onMatchupChange={handleMatchupChange}
        scoreboard={
          <MatchupScoreboard
            matchup={matchup}
            leagueId={leagueId}
            gamesRemaining={gamesRemaining}
          />
        }
        winProbabilityPanel={
          <PremiumGate
            isPremium={canSeeProjections}
            featureName="Matchup Projections"
            featureDescription="See win probability and projected scores for every matchup based on remaining games."
          >
            <MatchupWinProbabilityPanel matchup={matchup} />
          </PremiumGate>
        }
        rosterEditor={
          matchupId != null &&
          leagueId != null &&
          userTeamId != null &&
          isUserInMatchup ? (
            <MatchupRosterEditor
              matchupId={matchupId}
              leagueId={leagueId}
              userTeamId={userTeamId}
              matchupStatus={matchup.status ?? MatchupStatus.Completed}
              statsLoadingStatus={matchup.statsLoadingStatus}
              locked={matchup.status === MatchupStatus.InProgress}
            />
          ) : undefined
        }
        recapPanel={
          matchup.status === MatchupStatus.Completed && matchupId != null ? (
            <PremiumGate
              isPremium={canSeeRecap}
              featureName="AI Matchup Recap"
              featureDescription="Get AI-generated narrative recaps that summarize your matchup story, highlights, and standout performances."
            >
              <MatchupRecapPanel matchupId={matchupId} />
            </PremiumGate>
          ) : undefined
        }
        rosterComparison={
          <MatchupRosterComparison matchup={matchup} userTeamId={userTeamId} />
        }
      />
    </ScrollView>
  );
}
