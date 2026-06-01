import React from 'react';
import { useRouter } from 'expo-router';
import { NFLHome } from '@legacy-sports/shared-components/football';
import { useAuthorizedUserInfo } from '../../../common/auth/AuthorizedUserContext';
import {
  Sport,
  useGetUserLeaguesQuery,
} from '../../../api/db/graphql.generated';

export default function FootballHome() {
  const userInfo = useAuthorizedUserInfo();
  const router = useRouter();

  const { data, loading, error } = useGetUserLeaguesQuery({
    skip: !userInfo?.id,
  });

  type LeagueWithId = NonNullable<
    NonNullable<typeof data>['userLeagues'][number]
  > & { id: number };

  const leagues = React.useMemo(
    () =>
      (data?.userLeagues ?? [])
        .filter(Boolean)
        .filter((l) => l.sport === Sport.Football)
        .filter((l): l is LeagueWithId => l.id != null)
        .map((l) => ({
          id: l.id,
          name: l.name,
          draftStatus: l.draftStatus,
          currentWeekNumber: l.currentWeekNumber,
          weekAdvanceStatus: l.weekAdvanceStatus,
        })),
    [data?.userLeagues],
  );

  return (
    <NFLHome
      leagues={leagues}
      loading={loading && !data}
      error={!!error}
      onCreateLeague={() => router.push('/football/league/create')}
      onJoinLeague={() => router.push('/football/league/join')}
      onBrowseLeagues={() => router.push('/league-discovery')}
      onViewLeague={(id) =>
        router.push({
          pathname: '/football/league/[leagueId]',
          params: { leagueId: id },
        })
      }
    />
  );
}
