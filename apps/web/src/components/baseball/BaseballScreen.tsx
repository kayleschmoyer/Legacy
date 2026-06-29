import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MLBHome,
  type QuickCreateLeagueInput,
} from '@legacy-sports/shared-components/baseball';
import { useAuth } from '@legacy-sports/shared-components/auth';
import {
  GetUserLeagues,
  GetUserLeaguesQuery,
  Sport,
  useCreateLeagueAndTeamsMutation,
  useGetUserLeaguesQuery,
} from '@legacy-sports/graphql';
import { PageMeta } from '../PageMeta';
import { UpgradeModal } from '../UpgradeModal';
import { useIsPremiumStatus } from '../../hooks/useIsPremium';
import { formatDisplayName } from '../../lib/formatDisplayName';

// Free accounts may participate in at most this many non-mock leagues. Mirrors
// FREE_TIER_LEAGUE_LIMIT in the db lambda. The server is authoritative; this
// client-side check proactively gates CTAs instead of letting the mutation fail.
const FREE_TIER_LEAGUE_LIMIT = 3;

/**
 * Web data wrapper for the shared `MLBHome` (LS-7716). Mirrors the football
 * `FootballHubPage` pattern: this component owns the GraphQL query + mutation
 * and feeds props into the presentational, cross-platform `MLBHome`. Replaces
 * the former 1,700-line web-only `BaseballLandingPage`.
 */
export function BaseballScreen() {
  const navigate = useNavigate();
  const auth = useAuth();
  const { isPremium, isLoading: premiumLoading } = useIsPremiumStatus();
  const [showUpgradeModal, setShowUpgradeModal] = React.useState(false);

  const { data, loading, error, refetch } = useGetUserLeaguesQuery({
    // Only run the query if user is authenticated
    skip: !auth?.user,
    // Always refetch from network so deletions/adds are reflected immediately
    fetchPolicy: 'cache-and-network',
  });

  const [createLeague] = useCreateLeagueAndTeamsMutation({
    update: (cache, { data: created }) => {
      const newLeague = created?.createLeagueAndTeams?.league;
      if (!newLeague) return;
      try {
        const existing = cache.readQuery<GetUserLeaguesQuery>({
          query: GetUserLeagues,
        });
        if (existing?.userLeagues) {
          cache.writeQuery({
            query: GetUserLeagues,
            data: { userLeagues: [...existing.userLeagues, newLeague] },
          });
        }
      } catch {
        // ignore; query may not be in cache yet
      }
    },
  });

  const leagues = React.useMemo(
    () =>
      (data?.userLeagues ?? [])
        .filter(Boolean)
        .filter((l) => l?.sport === Sport.Baseball)
        .map((l) => ({
          id: l?.id ?? 0,
          name: l?.name,
          draftStatus: l?.draftStatus,
          currentWeekNumber: l?.currentWeekNumber,
          weekAdvanceStatus: l?.weekAdvanceStatus,
          maxRosterSize: l?.maxRosterSize,
          tierFrozenAt: l?.tierFrozenAt,
          frozenAt: l?.frozenAt,
        })),
    [data?.userLeagues],
  );

  // Loading guard: cover the one-render window between auth resolving and Apollo
  // starting the query — in that window `loading` is still false but `data` is
  // undefined. Without `|| (!data && !error)` the empty-league layout flashes
  // for returning users (LS-1269). Exclude the error case so the error notice
  // can render when the query fails.
  const showSpinner =
    auth.isLoading || (!!auth.user && (loading || (!data && !error)));

  // Count all leagues across sports — the backend cap is global (LS-5804).
  const activeLeagueCount = (data?.userLeagues ?? []).filter(Boolean).length;
  const atLeagueCap =
    !premiumLoading &&
    !isPremium &&
    activeLeagueCount >= FREE_TIER_LEAGUE_LIMIT;
  const handleCreateLeague = async (input: QuickCreateLeagueInput) => {
    if (atLeagueCap) {
      setShowUpgradeModal(true);
      return;
    }
    const result = await createLeague({
      variables: {
        input: {
          leagueName: input.leagueName,
          numberOfTeams: input.numberOfTeams,
          numberOfDivisions: input.numberOfDivisions,
          playerPool: input.playerPool,
          draftMode: input.draftMode,
          selectionMethod: input.selectionMethod,
          draftOrder: input.draftOrder,
          maxRosterSize: input.maxRosterSize,
          isPublic: input.isPublic,
          tradingEnabled: true,
          waiverEnabled: true,
        },
      },
    });
    const id = result.data?.createLeagueAndTeams?.league?.id;
    if (id) {
      navigate(`/baseball/league/${id}`);
      return;
    }
    throw new Error('Failed to create league. Please try again.');
  };

  return (
    <>
      <PageMeta
        title="Baseball"
        description="Manage your fantasy baseball leagues, draft players, track live stats, and compete with friends on Legacy Sports."
      />
      <div
        data-testid="baseball-screen"
        aria-label="Baseball fantasy landing page"
        role="region"
        tabIndex={-1}
        style={{ outline: 'none' }}
      >
        <MLBHome
          leagues={leagues}
          loading={showSpinner}
          error={!!error}
          userName={formatDisplayName(auth?.user?.username || 'Manager')}
          isAuthenticated={!!auth?.user}
          onCreateLeague={handleCreateLeague}
          onJoinLeague={() => navigate('/baseball/league/join')}
          onMockDraft={() => navigate('/baseball/mock-draft')}
          onViewLeague={(id) => navigate(`/baseball/league/${id}`)}
          onRetry={() => void refetch()}
          onSignIn={() => navigate('/')}
          onAdvancedCreate={(name) => {
            const params = name.trim()
              ? `?name=${encodeURIComponent(name.trim())}`
              : '';
            navigate(`/baseball/league/create${params}`);
          }}
          onBrowsePlayers={() => navigate('/players')}
          isPremium={isPremium && !premiumLoading}
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
