import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CombinedGraphQLErrors } from '@apollo/client';
import { Button, H2, Text, XStack, YStack } from 'tamagui';
import {
  MatchupAdditionalSections,
  MatchupDetailLayout,
  MatchupDetailSkeleton,
  MatchupRecapPanel,
} from '@legacy-sports/shared-components/matchup';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { useWebSocket } from '@legacy-sports/shared-components/ui';
import { ENTITLEMENTS } from '@legacy-sports/utils';
import {
  MatchupStatus,
  Sport,
  useGetLeagueByIdQuery,
  useGetUserTeamIdQuery,
} from '@legacy-sports/graphql';
import { env } from '../../config/environment';
import { PageMeta } from '../../components/PageMeta';
import { PremiumGate } from '../../components/PremiumGate';
import { MatchupScoreboard } from '../../features/matchup/MatchupScoreboard';
import { MatchupWinProbabilityPanel } from '../../features/matchup/MatchupWinProbabilityPanel';
import { MatchupRosterComparison } from '../../features/matchup/MatchupRosterComparison';
import { MatchupRosterEditor } from '../../features/matchup/MatchupRosterEditor';
import { useHasEntitlement } from '../../hooks/useIsPremium';
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

/** True when `error` is a GraphQL FORBIDDEN response (no league access) rather than a generic failure. */
function isForbiddenError(error: unknown): boolean {
  return (
    CombinedGraphQLErrors.is(error) &&
    error.errors.some((e) => e.extensions?.['code'] === 'FORBIDDEN')
  );
}

export function MatchupDetailPage() {
  const { leagueId, matchupId } = useParams<{
    leagueId: string;
    matchupId: string;
  }>();
  const navigate = useNavigate();

  const matchupIdNum = matchupId ? parseInt(matchupId, 10) : null;
  const leagueIdNum = leagueId ? parseInt(leagueId, 10) : null;
  const {
    matchup,
    loading,
    error,
    refetch: refetchMatchup,
  } = useMatchupById(matchupIdNum);

  const { matchups: allLeagueMatchups, refetch: refetchMatchups } =
    useMatchupsForLeague(leagueIdNum);
  const { currentWeek } = useCurrentWeek(leagueIdNum);

  // Refetch matchup + league-matchups state when the server signals stats
  // have been recalculated for this matchup, or when the websocket
  // reconnects after a drop — this page previously had no live-update
  // mechanism at all (LS-5425).
  //
  // This route (/football/league/:leagueId/matchups/:matchupId) is NOT
  // nested under LeagueDetailPage/LeagueDetailPageV2 (see app.tsx's route
  // table), so there is no LeagueWebSocketContext.Provider ancestor here —
  // `useLeagueWebSocket` would silently no-op (client: null), the same
  // documented gap SubscriptionPage.tsx's fallback works around for LS-7384.
  // This page instead opens its own connection via the shared-components
  // `useWebSocket` hook directly, mirroring that precedent.
  const { user, token: authToken } = useAuth();
  const matchupIdRef = useRef(matchupIdNum);
  matchupIdRef.current = matchupIdNum;
  const refetchMatchupRef = useRef(refetchMatchup);
  refetchMatchupRef.current = refetchMatchup;
  const refetchMatchupsRef = useRef(refetchMatchups);
  refetchMatchupsRef.current = refetchMatchups;
  // Bumped on every live-update event so MatchupScoreboard (which owns its
  // own separate players query) knows to refetch too, without this page
  // opening a second WebSocket connection on its behalf.
  const [liveUpdateSignal, setLiveUpdateSignal] = useState(0);
  useWebSocket({
    url: env.websocketUrl,
    token: authToken ?? undefined,
    leagueId: leagueIdNum ?? undefined,
    matchupId: matchupIdNum ?? undefined,
    viewContext: 'matchup',
    autoConnect: !!user && !!authToken,
    onMatchupStatsComplete: (notification) => {
      if (notification.matchupId !== matchupIdRef.current) return;
      void refetchMatchupRef.current();
      void refetchMatchupsRef.current();
      setLiveUpdateSignal((n) => n + 1);
    },
    onReconnect: () => {
      void refetchMatchupRef.current();
      void refetchMatchupsRef.current();
      setLiveUpdateSignal((n) => n + 1);
    },
  });

  const { data: userTeamData } = useGetUserTeamIdQuery({
    variables: { leagueId: leagueIdNum ?? 0 },
    skip: !leagueIdNum,
  });
  const userTeamId = userTeamData?.userTeamId ?? null;

  const { data: leagueData } = useGetLeagueByIdQuery({
    variables: { id: leagueIdNum ?? 0 },
    skip: !leagueIdNum,
  });
  const leagueSport = leagueData?.league?.sport ?? Sport.Baseball;

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

  const canSeeProjections = useHasEntitlement(ENTITLEMENTS.matchup_projections);
  const canSeeRecap = useHasEntitlement(ENTITLEMENTS.ai_matchup_recap);

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

  // Gate on `loading && !matchup`, not `loading` alone: `useMatchupById`
  // already falls back to `previousData` so `matchup` stays populated across
  // a background refetch (e.g. the websocket reconnect/stats-complete
  // handlers below), but a raw `loading` gate here ignored that and blanked
  // the whole page back to the skeleton anyway — discarding an
  // already-rendered scoreboard for the ~1 background round-trip. That
  // flash was flaky-visible under CPU contention as a genuine
  // disappear-then-reappear of on-screen content (LS-9733).
  if (loading && !matchup) {
    return <MatchupDetailSkeleton />;
  }

  if (error && isForbiddenError(error)) {
    return (
      <YStack
        padding="$4"
        alignItems="center"
        justifyContent="center"
        minHeight={400}
      >
        <Text color="$gray11" fontSize="$4">
          You no longer have access to this league
        </Text>
        <Button
          marginTop="$4"
          backgroundColor={BRAND_NAVY_LIGHT}
          color="white"
          pressStyle={{ backgroundColor: BRAND_NAVY_DARK }}
          hoverStyle={{ backgroundColor: BRAND_NAVY }}
          onPress={() => navigate('/')}
        >
          Back to Leagues
        </Button>
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
          Something went wrong loading this matchup. Please try again.
        </Text>
        <Button
          marginTop="$4"
          backgroundColor={BRAND_NAVY_LIGHT}
          color="white"
          pressStyle={{ backgroundColor: BRAND_NAVY_DARK }}
          hoverStyle={{ backgroundColor: BRAND_NAVY }}
          onPress={() => navigate(`/${leagueSport}/league/${leagueId}`)}
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
          onPress={() => navigate(`/${leagueSport}/league/${leagueId}`)}
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
        description={`View Week ${matchup.weekNumber ?? ''} fantasy ${leagueSport} matchup scores, rosters, and stats on Legacy Sports.`}
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
            navigate(
              `/${leagueSport}/league/${leagueId}/matchups/${numericId}`,
            );
          }
        }}
        onResetToDefault={() => {
          if (userCurrentMatchup?.id) {
            navigate(
              `/${leagueSport}/league/${leagueId}/matchups/${userCurrentMatchup.id}`,
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
              onPress={() => navigate(`/${leagueSport}/league/${leagueId}`)}
            >
              Back to League
            </Button>
          </XStack>
        }
        scoreboard={
          <MatchupScoreboard
            matchup={matchup}
            gamesRemaining={gamesRemaining}
            showTimeInfo={leagueSport === Sport.Football}
            liveUpdateSignal={liveUpdateSignal}
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
          userTeamId != null &&
          leagueIdNum != null &&
          (matchup.status === MatchupStatus.Scheduled ||
            matchup.status === MatchupStatus.InProgress) &&
          (matchup.team1Id === userTeamId || matchup.team2Id === userTeamId) ? (
            <MatchupRosterEditor
              matchup={matchup}
              userTeamId={userTeamId}
              leagueId={leagueIdNum}
              sport={leagueSport}
            />
          ) : undefined
        }
        recapPanel={
          matchup.status === MatchupStatus.Completed && matchupIdNum != null ? (
            <PremiumGate
              isPremium={canSeeRecap}
              featureName="AI Matchup Recap"
              featureDescription="Get AI-generated narrative recaps that summarize your matchup story, highlights, and standout performances."
              hideBlurredContentFromAssistiveTech
            >
              <MatchupRecapPanel matchupId={matchupIdNum} />
            </PremiumGate>
          ) : undefined
        }
        rosterComparison={
          <MatchupRosterComparison
            matchup={matchup}
            userTeamId={userTeamId}
            sport={leagueSport}
          />
        }
        additionalSections={
          leagueSport === Sport.Football ? (
            <MatchupAdditionalSections
              matchup={matchup}
              leagueId={leagueIdNum}
            />
          ) : undefined
        }
      />
    </>
  );
}
