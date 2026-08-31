import React from 'react';
import { useNavigate } from 'react-router-dom';
import { NFLHome } from '@legacy-sports/shared-components/football';
import { useAuth } from '@legacy-sports/shared-components/auth';
import {
  Sport,
  useFootballPlayersQuery,
  useGetUserLeaguesQuery,
} from '@legacy-sports/graphql';
import { PageMeta } from '../../components/PageMeta';
import { UpgradeModal } from '../../components/UpgradeModal';
import { useIsPremiumStatus } from '../../hooks/useIsPremium';
import { useFootballMatchupHighlights } from '../../hooks/useFootballMatchupHighlights';
import { getLastVisitedLeague } from '../../lib/last-visited-league';

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

  const { data, loading, error, refetch } = useGetUserLeaguesQuery({
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

  // Persistent league-cap indicator (LS-8928), wired the same way
  // BaseballScreen wires `leagueCap` into MLBHome — visible before the user
  // taps Create rather than only surfacing on click via UpgradeModal.
  const leagueCap =
    auth?.user && !premiumLoading && !isPremium
      ? {
          count: activeLeagueCount,
          limit: FREE_TIER_LEAGUE_LIMIT,
          atLimit: atLeagueCap,
          onUpgrade: () => navigate('/pricing'),
        }
      : undefined;

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
          tierFrozenAt: l.tierFrozenAt,
          frozenAt: l.frozenAt,
          leaguePhase: l.leaguePhase,
          permissionLevel: l.userMembership?.permissionLevel,
        })),
    [data?.userLeagues],
  );

  // "All Sports" switcher option (LS-6286 / FBH-032): only shown when the
  // user has leagues in more than one sport, derived from the already-fetched
  // userLeagues data — no new query needed.
  const hasMultipleSports = React.useMemo(() => {
    const sports = new Set(
      (data?.userLeagues ?? [])
        .filter(Boolean)
        .map((l) => l.sport ?? Sport.Football),
    );
    return sports.size > 1;
  }, [data?.userLeagues]);

  // Matchup highlights (LS-5407 / LS-6265, FBH-011): one "This Week's
  // Matchup" card per league that has an active/upcoming matchup, instead of
  // arbitrarily picking just the first league with a matchup and hiding the
  // rest for multi-league users. Bye week (LS-6264 / FBH-010): a league with
  // no matchup this week isn't necessarily "nothing to show" — the hook also
  // surfaces a defined bye-week card for active, mid-season leagues with no
  // current matchup, instead of that league silently dropping out.
  const handlePressMatchupLeague = React.useCallback(
    (leagueId: string | number) => {
      navigate(`/football/league/${leagueId}/matchup`);
    },
    [navigate],
  );
  const { highlights: matchupHighlights } = useFootballMatchupHighlights(
    leagues,
    handlePressMatchupLeague,
  );

  const handleViewLeague = React.useCallback(
    (leagueId: string | number) => navigate(`/football/league/${leagueId}`),
    [navigate],
  );

  // Resume-last-league shortcut (LS-6294 / FBH-040): only shown when the
  // last-visited league (LS-6694) is football and still among the leagues
  // this user belongs to, so the card never points at a league they left.
  const resumeLeague = React.useMemo(() => {
    const lastLeague = getLastVisitedLeague();
    if (!lastLeague || lastLeague.sport !== 'football') return undefined;
    const match = leagues.find(
      (l) => String(l.id) === String(lastLeague.leagueId),
    );
    if (!match) return undefined;
    return {
      id: match.id,
      name: match.name,
      onPress: () => handleViewLeague(match.id),
    };
  }, [leagues, handleViewLeague]);

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
          isAuthenticated={!!auth?.user}
          isPremium={isPremium}
          onCreateLeague={handleCreateLeague}
          onJoinLeague={() => navigate('/football/league/join')}
          onBrowseLeagues={() => navigate('/football/leagues')}
          onBrowsePlayers={() => navigate('/players?sport=nfl')}
          onViewLeague={handleViewLeague}
          trendingPlayers={trendingPlayers}
          trendingPlayersLoading={trendingPlayersLoading}
          matchupHighlights={matchupHighlights}
          onSwitchSport={(sport) => navigate(`/${sport}`)}
          onGoToAllSports={hasMultipleSports ? () => navigate('/') : undefined}
          onSignIn={() => navigate('/')}
          onRetry={() => void refetch()}
          leagueCap={leagueCap}
          hasUnlimitedLeagues={!!auth?.user && !premiumLoading && isPremium}
          resumeLeague={resumeLeague}
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
