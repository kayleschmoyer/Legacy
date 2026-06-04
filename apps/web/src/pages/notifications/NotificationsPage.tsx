import React from 'react';
import { useNavigate } from 'react-router-dom';
import { NotificationsScreen } from '@legacy-sports/shared-components/notifications';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { PageMeta } from '../../components/PageMeta';
import { env } from '../../config/environment';

const NotificationsPage: React.FC = () => {
  const { user, token } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  return (
    <>
      <PageMeta
        title="Notifications"
        description="View and manage your Legacy Sports notifications."
      />
      <NotificationsScreen
        userId={user.id}
        websocketUrl={env.websocketUrl}
        websocketToken={token ?? undefined}
        onNavigateToMatchup={(matchupId: number, leagueId: number) =>
          navigate(`/baseball/league/${leagueId}/matchups/${matchupId}`)
        }
        onNavigateToLeague={(leagueId: number) =>
          navigate(`/baseball/league/${leagueId}`)
        }
      />
    </>
  );
};

export default NotificationsPage;
