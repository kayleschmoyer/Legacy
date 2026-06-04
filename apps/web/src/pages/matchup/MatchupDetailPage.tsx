import React, { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, H2, Spinner, Text, XStack, YStack } from 'tamagui';
import {
  MatchupDetailLayout,
  MatchupRecapPanel,
} from '@legacy-sports/shared-components/matchup';
import { PageMeta } from '../../components/PageMeta';
import { PremiumGate } from '../../components/PremiumGate';
import { MatchupScoreboard } from '../../features/matchup/MatchupScoreboard';
import { MatchupWinProbabilityPanel } from '../../features/matchup/MatchupWinProbabilityPanel';
import { MatchupRosterComparison } from '../../features/matchup/MatchupRosterComparison';
import { MatchupRosterEditor } from '../../features/matchup/MatchupRosterEditor';
import {
  MatchupStatus,
  useGetUserTeamIdQuery,
} from '../../api/db/graphql.generated';
import { useIsPremium } from '../../hooks/useIsPremium';
import {
  useCurrentWeek,
  useMatchupById,
  useMatchupsForLeague,
} from '../../hooks/useMatchup';
import {
  BRAND_NAVY,
  BRAND_NAVY_DARK,
  BRAND_NAVY_LIGHT,
} from '../../constants/colors';
import { trackMatchupViewed } from '../../utils/analytics';

export function MatchupDetailPage() {
  const { leagueId, matchupId } = useParams<{
    leagueId: string;
    matchupId: string;
  }>();
  const navigate = useNavigate();

  const matchupIdNum = matchupId ? parseInt(matchupId, 10) : null;
  const leagueIdNum = leagueId ? parseInt(leagueId, 10) : null;
  const { matchup, loading, error } = useMatchupById(matchupIdNum);

  const { matchups: allLeagueMatchups } = useMatchupsForLeague(leagueIdNum);
  const { currentWeek } = useCurrentWeek(leagueIdNum);

  const { data: userTeamData } = useGetUserTeamIdQuery({
    variables: { leagueId: leagueIdNum ?? 0 },
    skip: !leagueIdNum,
  });
  const userTeamId = userTeamData?.userTeamId ?? null;

  const userCurrentMatchup = React.useMemo(() => {
    if (!currentWeek || !userTeamId || !allLeagueMatchups.length) return null;
    return (
      allLeagueMatchups.find(
        (m) =>
          m.weekNumber === currentWeek &&
          (m.team1Id === userTeamId || m.team2Id === userTeamId),
      ) ?? null
    );
  }, [currentWeek, userTeamId, allLeagueMatchups]);

  const isPremium = useIsPremium();

  const lastTrackedMatchupViewKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!matchup || !matchupIdNum || !leagueIdNum || currentWeek == null) {
      return;
    }
    const key = `${leagueIdNum}-${matchupIdNum}-${currentWeek}`;
    if (lastTrackedMatchupViewKeyRef.current === key) {
      return;
    }
    trackMatchupViewed(matchupIdNum, leagueIdNum, currentWeek);
    lastTrackedMatchupViewKeyRef.current = key;
  }, [matchup, matchupIdNum, leagueIdNum, currentWeek]);

  if (loading) {
    return (
      <YStack
        padding="$4"
        alignItems="center"
        justifyContent="center"
        minHeight={400}
      >
        <Spinner size="large" color={BRAND_NAVY_LIGHT} />
        <Text marginTop="$2" color="$gray11">
          Loading matchup details...
        </Text>
      </YStack>
    );
  }

  if (error) {
    return (
      <YStack
        padding="$4"
        alignItems="center"
        justifyContent="center"
        minHeight={400}
      >
        <Text color="$red10" fontSize="$5" fontWeight="bold">
          Error loading matchup
        </Text>
        <Text marginTop="$2" color="$gray11">
          {error.message}
        </Text>
        <Button
          marginTop="$4"
          backgroundColor={BRAND_NAVY_LIGHT}
          color="white"
          pressStyle={{ backgroundColor: BRAND_NAVY_DARK }}
          hoverStyle={{ backgroundColor: BRAND_NAVY }}
          onPress={() => navigate(`/baseball/league/${leagueId}`)}
        >
          Back to League
        </Button>
      </YStack>
    );
  }

  if (!matchup) {
    return (
      <YStack
        padding="$4"
        alignItems="center"
        justifyContent="center"
        minHeight={400}
      >
        <Text color="$gray11" fontSize="$4">
          Matchup not found
        </Text>
        <Button
          marginTop="$4"
          backgroundColor={BRAND_NAVY_LIGHT}
          color="white"
          pressStyle={{ backgroundColor: BRAND_NAVY_DARK }}
          hoverStyle={{ backgroundColor: BRAND_NAVY }}
          onPress={() => navigate(`/baseball/league/${leagueId}`)}
        >
          Back to League
        </Button>
      </YStack>
    );
  }

  if (leagueIdNum == null) {
    return (
      <YStack
        padding="$4"
        alignItems="center"
        justifyContent="center"
        minHeight={400}
      >
        <Text color="$gray11" fontSize="$4">
          Invalid league
        </Text>
      </YStack>
    );
  }

  const gamesRemaining =
    (matchup.gamesPerMatchup ?? 0) - (matchup.selectedGamesCount ?? 0);
  const isViewingOther =
    userCurrentMatchup != null && matchup.id !== userCurrentMatchup.id;

  return (
    <>
      <PageMeta
        title={
          matchup.weekNumber != null
            ? `Week ${matchup.weekNumber} Matchup`
            : 'Matchup Details'
        }
        description={`View Week ${matchup.weekNumber ?? ''} fantasy baseball matchup scores, rosters, and stats on Legacy Sports.`}
      />
      <MatchupDetailLayout
        matchup={matchup}
        leagueId={leagueIdNum}
        userTeamId={userTeamId}
        allMatchups={allLeagueMatchups}
        currentWeek={currentWeek ?? undefined}
        isViewingOther={isViewingOther}
        onMatchupChange={(id) => {
          const numericId = parseInt(id, 10);
          if (!isNaN(numericId)) {
            navigate(`/baseball/league/${leagueId}/matchups/${numericId}`);
          }
        }}
        onResetToDefault={() => {
          if (userCurrentMatchup?.id) {
            navigate(
              `/baseball/league/${leagueId}/matchups/${userCurrentMatchup.id}`,
            );
          }
        }}
        header={
          <XStack
            justifyContent="space-between"
            alignItems="center"
            flexWrap="wrap"
            gap="$2"
            $sm={{ flexDirection: 'column', alignItems: 'flex-start' }}
          >
            <H2>Matchup Details</H2>
            <Button
              theme="alt2"
              onPress={() => navigate(`/baseball/league/${leagueId}`)}
            >
              Back to League
            </Button>
          </XStack>
        }
        scoreboard={
          <MatchupScoreboard
            matchup={matchup}
            gamesRemaining={gamesRemaining}
          />
        }
        winProbabilityPanel={
          <PremiumGate
            isPremium={isPremium}
            featureName="Matchup Projections"
            featureDescription="See win probability and projected scores for every matchup based on remaining games."
          >
            <MatchupWinProbabilityPanel matchup={matchup} />
          </PremiumGate>
        }
        rosterEditor={
          userTeamId != null &&
          leagueIdNum != null &&
          (matchup.status === MatchupStatus.Scheduled ||
            matchup.status === MatchupStatus.InProgress) &&
          (matchup.team1Id === userTeamId || matchup.team2Id === userTeamId) ? (
            <MatchupRosterEditor
              matchup={matchup}
              userTeamId={userTeamId}
              leagueId={leagueIdNum}
            />
          ) : undefined
        }
        recapPanel={
          matchup.status === MatchupStatus.Completed && matchupIdNum != null ? (
            <PremiumGate
              isPremium={isPremium}
              featureName="AI Matchup Recap"
              featureDescription="Get AI-generated narrative recaps that summarize your matchup story, highlights, and standout performances."
            >
              <MatchupRecapPanel matchupId={matchupIdNum} />
            </PremiumGate>
          ) : undefined
        }
        rosterComparison={
          <MatchupRosterComparison matchup={matchup} userTeamId={userTeamId} />
        }
      />
    </>
  );
}
