import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MLBHome,
  type QuickCreateLeagueInput,
} from '@legacy-sports/shared-components/baseball';
import { useAuth } from '@legacy-sports/shared-components/auth';
import {
  GetMyLeagues,
  GetMyLeaguesQuery,
  Sport,
  useCreateLeagueAndTeamsMutation,
  useGetMyLeaguesQuery,
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
  const [showMockDraftUpgradeModal, setShowMockDraftUpgradeModal] =
    React.useState(false);

  const { data, loading, error, refetch } = useGetMyLeaguesQuery({
    variables: { sport: Sport.Baseball },
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
        const existing = cache.readQuery<GetMyLeaguesQuery>({
          query: GetMyLeagues,
          variables: { sport: Sport.Baseball },
        });
        if (existing?.myLeagues) {
          cache.writeQuery({
            query: GetMyLeagues,
            variables: { sport: Sport.Baseball },
            data: { myLeagues: [...existing.myLeagues, newLeague] },
          });
        }
      } catch {
        // ignore; query may not be in cache yet
      }
    },
  });

  const leagues = React.useMemo(
    () =>
      (data?.myLeagues ?? []).filter(Boolean).map((l) => ({
        id: l?.id ?? 0,
        name: l?.name,
        draftStatus: l?.draftStatus,
        currentWeekNumber: l?.currentWeekNumber,
        weekAdvanceStatus: l?.weekAdvanceStatus,
        maxRosterSize: l?.maxRosterSize,
        frozenAt: l?.frozenAt,
        permissionLevel: l?.userMembership?.permissionLevel,
      })),
    [data?.myLeagues],
  );

  // Loading guard: cover the one-render window between auth resolving and Apollo
  // starting the query — in that window `loading` is still false but `data` is
  // undefined. Without `|| (!data && !error)` the empty-league layout flashes
  // for returning users (LS-1269). Exclude the error case so the error notice
  // can render when the query fails.
  const showSpinner =
    auth.isLoading || (!!auth.user && (loading || (!data && !error)));

  // Count all leagues across sports — the backend cap is global (LS-5804).
  const activeLeagueCount = (data?.myLeagues ?? []).filter(Boolean).length;
  // Only show the cap indicator (and upgrade CTA) for authenticated non-premium
  // users once we know their subscription status. Mirrors the native guard in
  // baseball/index.tsx (showLeagueCap).
  const leagueCap =
    auth?.user && !premiumLoading && !isPremium
      ? {
          count: activeLeagueCount,
          limit: FREE_TIER_LEAGUE_LIMIT,
          // Web never hard-gates league creation (LS-5869); atLimit is always
          // false so the create button stays enabled while the upgrade CTA shows.
          atLimit: false as const,
          onUpgrade: () => navigate('/pricing'),
        }
      : undefined;

  const handleCreateLeague = async (input: QuickCreateLeagueInput) => {
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
          onMockDraftUpgrade={() => setShowMockDraftUpgradeModal(true)}
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
          leagueCap={leagueCap}
        />
      </div>
      <UpgradeModal
        open={showMockDraftUpgradeModal}
        onOpenChange={setShowMockDraftUpgradeModal}
        featureName="Unlimited mock drafts"
        featureDescription="Free accounts can run 2 mock drafts per week. Upgrade to Premium for unlimited mock drafts anytime."
      />
    </>
  );
}
