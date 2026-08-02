import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { config } from '@legacy-sports/app-config/native';
import { NotificationsScreen as NotificationsScreenComponent } from '@legacy-sports/shared-components/notifications';
import { LOGGER } from '@legacy-sports/logging';
import { useAuthorizedUserInfo } from '../../common/auth/AuthorizedUserContext';
import { readKeychainValue, Secret } from '../../common/auth/AuthHooks';

export default function NotificationsScreen(): React.JSX.Element {
  const userInfo = useAuthorizedUserInfo();
  const router = useRouter();
  const [wsToken, setWsToken] = useState<string | undefined>();

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const token = await readKeychainValue(Secret.INTERNAL_JWT);
        if (active && token) setWsToken(token);
      } catch (err) {
        LOGGER.error(
          'NotificationsScreen: failed to read keychain token',
          err instanceof Error ? err : String(err),
        );
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <NotificationsScreenComponent
      userId={userInfo.id}
      websocketUrl={config.websocketUrl}
      websocketToken={wsToken}
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
