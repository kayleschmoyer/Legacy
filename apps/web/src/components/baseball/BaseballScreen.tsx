import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MLBHome,
  type QuickCreateLeagueInput,
} from '@legacy-sports/shared-components/baseball';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { PageMeta } from '../PageMeta';
import { formatDisplayName } from '../../lib/formatDisplayName';
import {
  GetUserLeagues,
  GetUserLeaguesQuery,
  useCreateLeagueAndTeamsMutation,
  useGetUserLeaguesQuery,
} from '../../api/db/graphql.generated';

/**
 * Web data wrapper for the shared `MLBHome` (LS-7716). Mirrors the football
 * `FootballHubPage` pattern: this component owns the GraphQL query + mutation
 * and feeds props into the presentational, cross-platform `MLBHome`. Replaces
 * the former 1,700-line web-only `BaseballLandingPage`.
 */
export function BaseballScreen() {
  const navigate = useNavigate();
  const auth = useAuth();

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

  // Preserve the previous BaseballLandingPage behavior: list every league the
  // user belongs to (no sport filter), mapped to the shared `MLBHome` shape.
  const leagues = React.useMemo(
    () =>
      (data?.userLeagues ?? []).filter(Boolean).map((l) => ({
        id: l?.id ?? 0,
        name: l?.name,
        draftStatus: l?.draftStatus,
        currentWeekNumber: l?.currentWeekNumber,
        weekAdvanceStatus: l?.weekAdvanceStatus,
        maxRosterSize: l?.maxRosterSize,
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
          onViewLeague={(id) => navigate(`/baseball/league/${id}`)}
          onRetry={() => void refetch()}
          onSignIn={() => navigate('/')}
          onAdvancedCreate={(name) => {
            const params = name.trim()
              ? `?name=${encodeURIComponent(name.trim())}`
              : '';
            navigate(`/baseball/league/create${params}`);
          }}
        />
      </div>
    </>
  );
}
