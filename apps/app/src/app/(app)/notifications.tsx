import React from 'react';
import { useRouter } from 'expo-router';
import { NotificationsScreen } from '@legacy-sports/shared-components/notifications';
import { useAuthorizedUserInfo } from '../../common/auth/AuthorizedUserContext';

export default function NotificationsScreen(): React.JSX.Element {
  const userInfo = useAuthorizedUserInfo();
  const router = useRouter();

  return (
    <NotificationsScreen
      userId={userInfo.id}
      onNavigateToMatchup={(matchupId, leagueId) =>
        router.push({
          pathname: '/baseball/matchup' as never,
          params: {
            matchupId: String(matchupId),
            leagueId: String(leagueId),
          },
        } as never)
      }
      onNavigateToLeague={(leagueId) =>
        router.push({
          pathname: '/baseball/league/[leagueId]' as never,
          params: { leagueId: String(leagueId) },
        } as never)
      }
    />
  );
}
export { ScreenErrorBoundary as ErrorBoundary } from './_screenErrorBoundary';
