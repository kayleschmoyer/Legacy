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
import { useFeatureIsOn } from '../../context/GrowthBookProvider';

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
  const footballEnabled = useFeatureIsOn('football_enabled');
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
          variables: { sport: Sport.Baseball },
        });
        if (existing?.userLeagues) {
          cache.writeQuery({
            query: GetUserLeagues,
            variables: { sport: Sport.Baseball },
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
      (data?.userLeagues ?? []).filter(Boolean).map((l) => ({
        id: l?.id ?? 0,
        name: l?.name,
        draftStatus: l?.draftStatus,
        currentWeekNumber: l?.currentWeekNumber,
        weekAdvanceStatus: l?.weekAdvanceStatus,
        maxRosterSize: l?.maxRosterSize,
        frozenAt: l?.frozenAt,
        permissionLevel: l?.userMembership?.permissionLevel,
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
        .map((l) => l.sport ?? Sport.Baseball),
    );
    return sports.size > 1;
  }, [data?.userLeagues]);

  // Loading guard: cover the one-render window between auth resolving and Apollo
  // starting the query — in that window `loading` is still false but `data` is
  // undefined. Without `|| (!data && !error)` the empty-league layout flashes
  // for returning users (LS-1269). Exclude the error case so the error notice
  // can render when the query fails.
  const showSpinner =
    auth.isLoading || (!!auth.user && (loading || (!data && !error)));

  // Count all leagues across sports — the backend cap is global (LS-5804).
  // `userLeagues` is now paginated (LS-9101), so the authoritative,
  // unpaginated `userLeagueCount` must be used instead of array length once a
  // user has more leagues than the page size.
  const activeLeagueCount = data?.userLeagueCount ?? 0;
  // Only show the cap indicator (and upgrade CTA) for authenticated non-premium
  // users once we know their subscription status. Mirrors the native guard in
  // baseball/index.tsx (showLeagueCap).
  const leagueCap =
    auth?.user && !premiumLoading && !isPremium
      ? {
          count: activeLeagueCount,
          limit: FREE_TIER_LEAGUE_LIMIT,
          atLimit: activeLeagueCount >= FREE_TIER_LEAGUE_LIMIT,
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
          waiverType: input.waiverType,
          faabBudgetDefault: input.faabBudget,
          salaryCapEnabled: input.salaryCapEnabled,
          salaryCap: input.salaryCapAmount,
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
          onSwitchSport={
            footballEnabled ? (sport) => navigate(`/${sport}`) : undefined
          }
          onGoToAllSports={
            footballEnabled && hasMultipleSports
              ? () => navigate('/')
              : undefined
          }
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
