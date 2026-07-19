import React from 'react';
import { useRouter } from 'expo-router';
import { NotificationsScreen as NotificationsScreenComponent } from '@legacy-sports/shared-components/notifications';
import { useAuthorizedUserInfo } from '../../common/auth/AuthorizedUserContext';

export default function NotificationsScreen(): React.JSX.Element {
  const userInfo = useAuthorizedUserInfo();
  const router = useRouter();

  return (
    <NotificationsScreenComponent
      userId={userInfo.id}
      onNavigateToMatchup={(matchupId, leagueId) =>
        router.push({
          pathname: '/baseball/matchup',
          params: {
            matchupId: String(matchupId),
            leagueId: String(leagueId),
          },
        })
      }
      onNavigateToLeague={(leagueId) =>
        router.push({
          pathname: '/baseball/league/[leagueId]',
          params: { leagueId: String(leagueId) },
        })
      }
      onNavigateToTrades={(leagueId, tradeOfferId) =>
        router.push({
          pathname: '/TradeCenterPage',
          params: {
            leagueId: String(leagueId),
            ...(tradeOfferId != null && {
              tradeOfferId: String(tradeOfferId),
            }),
          },
        })
      }
    />
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from './_screenErrorBoundary';
