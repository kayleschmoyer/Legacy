import React, { useCallback, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LOGGER } from '@legacy-sports/logging';
import {
  type BrowseQuery,
  type InviteCodeLeague,
  JoinLeagueScreen,
  type JoinLeagueTab,
  type PublicLeagueRow,
  type Sport,
} from '@legacy-sports/shared-components/leagues';
import {
  Sport as GqlSport,
  useGetPublicLeaguesCountQuery,
  useGetPublicLeaguesQuery,
  useJoinLeagueByCodeMutation,
  useJoinPublicLeagueMutation,
  useValidateInviteCodeLazyQuery,
} from '@legacy-sports/graphql';
import { navigateFromModal } from '../../../common/utilities/RouteUtils';

/** How many browse rows to pull per page. */
const BROWSE_PAGE_SIZE = 50;

function leagueRoute(sport: string | null | undefined, leagueId: number) {
  return sport === 'football'
    ? `/football/league/${leagueId}`
    : `/baseball/league/${leagueId}`;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function toGqlSport(sport: string | undefined): GqlSport | undefined {
  return sport === 'football'
    ? GqlSport.Football
    : sport === 'baseball'
      ? GqlSport.Baseball
      : undefined;
}

/**
 * The two-tab "Invite or Browse" Join League screen (LS-8812).
 *
 * A thin data wrapper around the shared `JoinLeagueScreen`: this file owns
 * GraphQL and expo-router navigation, the shared component owns all UI and
 * form state. That split matches LS-8795 (`LeaguesLedgerScreen`) and LS-8800
 * (`GameRoomScreen`).
 *
 * Sport is derived from the entry route rather than an in-form selector — the
 * `/{sport}/league/join` wrappers pass it through (AC2).
 */
export default function JoinLeagueRoute(): React.JSX.Element {
  const router = useRouter();
  const { top: topInset } = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    sport?: string;
    inviteCode?: string;
    tab?: string;
  }>();

  const sport: Sport = params.sport === 'football' ? 'football' : 'baseball';
  const initialTab: JoinLeagueTab =
    params.tab === 'browse' ? 'browse' : 'invite';

  /* ── Invite code tab ── */

  const [validateCode] = useValidateInviteCodeLazyQuery();
  const [joinByCode, { loading: joiningByCode }] =
    useJoinLeagueByCodeMutation();
  const [inviteError, setInviteError] = useState<string | null>(null);

  const validateInviteCode = useCallback(
    async (code: string): Promise<InviteCodeLeague | null> => {
      const result = await validateCode({ variables: { code } });
      return result.data?.validateInviteCode ?? null;
    },
    [validateCode],
  );

  const handleJoinByCode = useCallback(
    (code: string, teamName: string) => {
      setInviteError(null);
      void (async () => {
        try {
          const result = await joinByCode({
            variables: { inviteCode: code, teamName },
          });
          const leagueId = result.data?.joinLeagueByCode?.leagueId;
          if (leagueId != null) {
            navigateFromModal(router, leagueRoute(sport, leagueId));
          }
        } catch (err) {
          LOGGER.error(
            'Failed to join league by code',
            err instanceof Error ? err : new Error(String(err)),
          );
          setInviteError(errorMessage(err, 'Failed to join league'));
        }
      })();
    },
    [joinByCode, router, sport],
  );

  /* ── Browse Public tab ── */

  // Browse defaults to the entry sport (AC8); the shared screen emits the full
  // query whenever its search, filters or sort change.
  const [browseQuery, setBrowseQuery] = useState<BrowseQuery>({
    sport,
    sortBy: 'spotsLeft',
  });
  // The browse query only runs once the tab has actually been opened, so
  // landing on the invite tab from a deep link costs no extra round trips.
  const [browseActivated, setBrowseActivated] = useState(
    initialTab === 'browse',
  );
  const [browseJoinError, setBrowseJoinError] = useState<string | null>(null);

  const browseVariables = {
    search: browseQuery.search,
    sport: toGqlSport(browseQuery.sport),
    eraFilter: browseQuery.eraFilter,
    hasOpenSpots: browseQuery.hasOpenSpots,
    minRosterSize: browseQuery.minRosterSize,
    maxRosterSize: browseQuery.maxRosterSize,
    sortBy: browseQuery.sortBy,
  };

  const {
    data: browseData,
    loading: browseLoading,
    refetch: refetchBrowse,
  } = useGetPublicLeaguesQuery({
    variables: { ...browseVariables, limit: BROWSE_PAGE_SIZE },
    fetchPolicy: 'cache-and-network',
    skip: !browseActivated,
  });

  const { data: countData, refetch: refetchCount } =
    useGetPublicLeaguesCountQuery({
      variables: browseVariables,
      fetchPolicy: 'cache-and-network',
      skip: !browseActivated,
    });

  const [joinPublic, { loading: joiningPublic }] =
    useJoinPublicLeagueMutation();

  const handleJoinPublic = useCallback(
    (league: PublicLeagueRow, teamName: string) => {
      if (league.id == null) return;
      const leagueId = league.id;
      setBrowseJoinError(null);
      void (async () => {
        try {
          const result = await joinPublic({
            variables: { leagueId, teamName },
          });
          const payload = result.data?.joinPublicLeague;
          if (payload?.success) {
            await Promise.all([refetchBrowse(), refetchCount()]);
            // Route by the joined league's own sport, not a hard-coded
            // baseball path as the retired league-discovery screen did (AC8).
            navigateFromModal(
              router,
              leagueRoute(league.sport ?? sport, payload.leagueId ?? leagueId),
            );
          } else {
            // Failures render inline in the sheet — no Alert.alert (AC11).
            setBrowseJoinError(payload?.message ?? 'Failed to join league');
          }
        } catch (err) {
          LOGGER.error(
            'Failed to join public league',
            err instanceof Error ? err : new Error(String(err)),
          );
          setBrowseJoinError(
            errorMessage(
              err,
              'An unexpected error occurred. Please try again.',
            ),
          );
        }
      })();
    },
    [joinPublic, refetchBrowse, refetchCount, router, sport],
  );

  const handleTabChange = useCallback((tab: JoinLeagueTab) => {
    if (tab === 'browse') setBrowseActivated(true);
  }, []);

  return (
    <JoinLeagueScreen
      sport={sport}
      topInset={topInset}
      initialInviteCode={params.inviteCode}
      initialTab={initialTab}
      onTabChange={handleTabChange}
      onClose={() => router.back()}
      validateInviteCode={validateInviteCode}
      onJoinByCode={handleJoinByCode}
      joiningByCode={joiningByCode}
      inviteError={inviteError}
      onGoToLeague={(leagueId) =>
        navigateFromModal(router, leagueRoute(sport, leagueId))
      }
      onBrowseQueryChange={setBrowseQuery}
      browseLeagues={browseData?.publicLeagues ?? []}
      browseTotalCount={countData?.publicLeaguesCount}
      browseLoading={browseLoading}
      onJoinPublic={handleJoinPublic}
      joiningPublic={joiningPublic}
      browseJoinError={browseJoinError}
    />
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';
