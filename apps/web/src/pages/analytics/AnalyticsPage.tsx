import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { AnalyticsScreen } from '@legacy-sports/shared-components/analytics';
import { PageMeta } from '../../components/PageMeta';

const AnalyticsPage: React.FC = () => {
  const { leagueId } = useParams<{ leagueId: string }>();
  const parsedLeagueId = Number.parseInt(leagueId ?? '', 10);

  if (!Number.isFinite(parsedLeagueId)) {
    return <Navigate to="/baseball/leagues" replace />;
  }

  return (
    <>
      <PageMeta
        title="League Analytics"
        description="View league-wide analytics and trends for your Legacy Sports league."
      />
      <AnalyticsScreen leagueId={parsedLeagueId} />
    </>
  );
};

export default AnalyticsPage;
