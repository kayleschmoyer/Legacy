import React from 'react';
import { useNavigate } from 'react-router-dom';
import { NFLHome } from '@legacy-sports/shared-components/football';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { PageMeta } from '../../components/PageMeta';
import { Sport, useGetUserLeaguesQuery } from '../../api/db/graphql.generated';

export function FootballHubPage() {
  const navigate = useNavigate();
  const auth = useAuth();

  const { data, loading, error } = useGetUserLeaguesQuery({
    skip: !auth?.user,
    fetchPolicy: 'cache-and-network',
  });

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
          onCreateLeague={() => navigate('/football/league/create')}
          onBrowseLeagues={() => navigate('/football/leagues')}
          onViewLeague={(id: string | number) =>
            navigate(`/football/league/${id}`)
          }
        />
      </div>
    </>
  );
}
