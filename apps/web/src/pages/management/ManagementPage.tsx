import React from 'react';
import { LeagueManagement } from '../../features/management';
import { PageMeta } from '../../components/PageMeta';

const ManagementPage: React.FC = () => {
  return (
    <>
      <PageMeta
        title="League Management"
        description="Manage your fantasy baseball leagues, teams, rosters, and commissioner settings on Legacy Sports."
      />
      <LeagueManagement />
    </>
  );
};

export default ManagementPage;
