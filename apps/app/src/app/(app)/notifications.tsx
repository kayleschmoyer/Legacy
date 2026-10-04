import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
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
    <View testID="notifications-page" style={{ flex: 1 }}>
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
        onNavigateToInviteTarget={(target) => {
          // An accepted invite (LS-10078) lands in the mock draft or league.
          if (target.kind === 'mock') {
            router.push({
              pathname: '/mock-draft/[draftId]',
              params: { draftId: String(target.draftId) },
            });
          } else {
            router.push(`/${target.sport}/league/${String(target.leagueId)}`);
          }
        }}
      />
    </View>
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from './_screenErrorBoundary';
