import React from 'react';
import { useNavigate } from 'react-router-dom';
import { NFLHome } from '@legacy-sports/shared-components/football';
import type { NFLHomeMatchupHighlight } from '@legacy-sports/shared-components/football';
import { useAuth } from '@legacy-sports/shared-components/auth';
import {
  MatchupStatus,
  Sport,
  useFootballPlayersQuery,
  useGetLeagueTeamsQuery,
  useGetMatchupByIdQuery,
  useGetUserLeaguesQuery,
} from '@legacy-sports/graphql';
import { PageMeta } from '../../components/PageMeta';
import { UpgradeModal } from '../../components/UpgradeModal';
import { useIsPremiumStatus } from '../../hooks/useIsPremium';

// Free accounts may participate in at most this many non-mock leagues before a
// premium subscription is required. Mirrors FREE_TIER_LEAGUE_LIMIT in the db
// lambda (lambdas/db/src/schema/subscriptions.ts). The server is authoritative;
// this client-side check exists only to surface the cap proactively instead of
// letting the user fill out the creation form and hit a backend error (LS-5184).
const FREE_TIER_LEAGUE_LIMIT = 3;

export function FootballHubPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const { isPremium, isLoading: premiumLoading } = useIsPremiumStatus();
  const [showUpgradeModal, setShowUpgradeModal] = React.useState(false);

  const { data, loading, error } = useGetUserLeaguesQuery({
    skip: !auth?.user,
    fetchPolicy: 'cache-and-network',
  });

  // Top/trending players preview (LS-5411). Pool-wide fantasy points, top 5 —
  // no dedicated "trending" backend metric exists, so this reuses the
  // existing footballPlayers sort support (fpts desc) rather than adding one.
  const { data: trendingPlayersData, loading: trendingPlayersLoading } =
    useFootballPlayersQuery({
      variables: { first: 5, sortBy: 'fpts', sortDir: 'desc' },
    });
  const trendingPlayers = trendingPlayersData?.footballPlayers?.nodes ?? [];

  // `userLeagues` is paginated (LS-9101), so its array length can under-count
  // once a user has more leagues than the page size. `userLeagueCount` is the
  // authoritative, unpaginated total of non-mock leagues the user is a member
  // of (owned + joined), across every sport — exactly what the backend
  // enforces the free-tier cap on.
  const activeLeagueCount = data?.userLeagueCount ?? 0;

  // Only gate once we are confident the user is on the free tier and at the cap.
  // While premium status is still resolving we allow the navigation, so a
  // premium user who happens to have 3+ leagues is never briefly blocked.
  const atLeagueCap =
    !premiumLoading &&
    !isPremium &&
    activeLeagueCount >= FREE_TIER_LEAGUE_LIMIT;

  const leagues = React.useMemo(
    () =>
      (data?.userLeagues ?? [])
        .filter(Boolean)
        // Legacy/un-migrated leagues can have a null sport (FBH-001) — treat
        // them as football rather than silently dropping them, since the
        // alternative is the user losing access to the league entirely.
        .filter((l) => l.sport === Sport.Football || l.sport == null)
        .filter((l): l is typeof l & { id: string | number } => l.id != null)
        .map((l) => ({
          id: l.id,
          name: l.name,
          draftStatus: l.draftStatus,
          currentWeekNumber: l.currentWeekNumber,
          weekAdvanceStatus: l.weekAdvanceStatus,
          maxRosterSize: l.maxRosterSize,
          currentMatchup: l.currentMatchup,
        })),
    [data?.userLeagues],
  );

  // Matchup highlight (LS-5407, FBH feature): the first football league with
  // an active/upcoming matchup drives the "This Week's Matchup" card. Only
  // one card is shown on the hub, so the first match is sufficient — there is
  // no ordering requirement in the AC beyond "a league with a matchup".
  const highlightLeague = React.useMemo(
    () => leagues.find((l) => l.currentMatchup != null) ?? null,
    [leagues],
  );

  const { data: matchupData } = useGetMatchupByIdQuery({
    variables: { id: highlightLeague?.currentMatchup as number },
    skip: !highlightLeague?.currentMatchup,
  });
  const matchup = matchupData?.getMatchupById;

  // League ids are numeric GraphQL Ints, but NFLHomeLeague.id is typed
  // string | number for platform flexibility. Coerce defensively and skip the
  // query rather than sending a NaN variable if a caller ever passes a
  // non-numeric id (LS-5407 review).
  const highlightLeagueNumericId = React.useMemo(() => {
    if (highlightLeague == null) return null;
    const n = Number(highlightLeague.id);
    return Number.isFinite(n) ? n : null;
  }, [highlightLeague]);

  const { data: teamsData } = useGetLeagueTeamsQuery({
    variables: { leagueId: highlightLeagueNumericId as number },
    skip: highlightLeagueNumericId == null,
  });
  const teams = React.useMemo(() => teamsData?.leagueTeams ?? [], [teamsData]);

  const matchupHighlight: NFLHomeMatchupHighlight | null = React.useMemo(() => {
    if (
      !highlightLeague ||
      !matchup ||
      matchup.status === MatchupStatus.Cancelled
    ) {
      return null;
    }
    const homeTeam = teams.find((t) => t?.id === matchup.team1Id);
    const awayTeam = teams.find((t) => t?.id === matchup.team2Id);
    if (!homeTeam || !awayTeam || matchup.weekNumber == null) {
      return null;
    }
    const status =
      matchup.status === MatchupStatus.InProgress
        ? 'live'
        : matchup.status === MatchupStatus.Completed
          ? 'final'
          : 'pre';
    return {
      leagueId: highlightLeague.id,
      leagueName: highlightLeague.name,
      weekNumber: matchup.weekNumber,
      awayTeamName: awayTeam.name ?? 'Away',
      homeTeamName: homeTeam.name ?? 'Home',
      status,
      onPress: () => navigate(`/football/league/${highlightLeague.id}/matchup`),
    };
  }, [highlightLeague, matchup, teams, navigate]);

  const handleCreateLeague = () => {
    // Proactively gate free users who are already at the league cap so they see
    // the upgrade path before filling out the form instead of a backend error.
    if (atLeagueCap) {
      setShowUpgradeModal(true);
      return;
    }
    navigate('/football/league/create');
  };

  return (
    <>
      <PageMeta
        title="Football"
        description="Manage your fantasy football leagues, draft players, track live stats, and compete with friends on Legacy Sports."
      />
      <div
        data-testid="football-screen"
        aria-label="Football fantasy landing page"
        role="region"
        tabIndex={-1}
        style={{ outline: 'none' }}
      >
        <NFLHome
          leagues={leagues}
          loading={loading && !data}
          error={!!error}
          onCreateLeague={handleCreateLeague}
          onJoinLeague={() => navigate('/football/league/join')}
          onBrowseLeagues={() => navigate('/football/leagues')}
          onBrowsePlayers={() => navigate('/football/players')}
          onViewLeague={(id: string | number) =>
            navigate(`/football/league/${id}`)
          }
          trendingPlayers={trendingPlayers}
          trendingPlayersLoading={trendingPlayersLoading}
          matchupHighlight={matchupHighlight}
          onSwitchSport={(sport) => navigate(`/${sport}`)}
        />
      </div>
      <UpgradeModal
        open={showUpgradeModal}
        onOpenChange={setShowUpgradeModal}
        featureName="Unlimited league creation"
        featureDescription={`Free accounts can be part of up to ${FREE_TIER_LEAGUE_LIMIT} leagues total, across every sport — baseball and football leagues both count toward the same limit. Upgrade to Premium to create and join unlimited leagues.`}
      />
    </>
  );
}
