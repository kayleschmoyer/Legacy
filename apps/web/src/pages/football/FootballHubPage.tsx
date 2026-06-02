import React from 'react';
import { useNavigate } from 'react-router-dom';
import { NFLHome } from '@legacy-sports/shared-components/football';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { PageMeta } from '../../components/PageMeta';
import { UpgradeModal } from '../../components/UpgradeModal';
import { useIsPremiumStatus } from '../../hooks/useIsPremium';
import { Sport, useGetUserLeaguesQuery } from '../../api/db/graphql.generated';

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

  // `userLeagues` already excludes mock-draft leagues and spans every sport, so
  // its length is exactly the count the backend enforces the free-tier cap on:
  // distinct non-mock leagues the user is a member of (owned + joined). The cap
  // is global across sports, so we count all of them — not just football.
  const activeLeagueCount = (data?.userLeagues ?? []).filter(Boolean).length;

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
        .filter((l) => l.sport === Sport.Football)
        .filter((l): l is typeof l & { id: string | number } => l.id != null)
        .map((l) => ({
          id: l.id,
          name: l.name,
          draftStatus: l.draftStatus,
          currentWeekNumber: l.currentWeekNumber,
          weekAdvanceStatus: l.weekAdvanceStatus,
        })),
    [data?.userLeagues],
  );

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
          onBrowseLeagues={() => navigate('/football/leagues')}
          onViewLeague={(id: string | number) =>
            navigate(`/football/league/${id}`)
          }
        />
      </div>
      <UpgradeModal
        open={showUpgradeModal}
        onOpenChange={setShowUpgradeModal}
        featureName="Unlimited league creation"
        featureDescription={`Free accounts can be part of up to ${FREE_TIER_LEAGUE_LIMIT} leagues. Upgrade to Premium to create and join unlimited leagues.`}
      />
    </>
  );
}
