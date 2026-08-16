import React, { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, YStack } from 'tamagui';
import { EliteDraftBoardScreen } from '@legacy-sports/shared-components/elite-draft';
import { LOGGER } from '@legacy-sports/logging';
import { config } from '@legacy-sports/app-config/native';
import { toIntId } from '../../common/utilities/RouteUtils';

// Deliberately no pull-to-refresh here (LS-8847): the board is WebSocket-driven
// and already live-updates via `EliteDraftBoardScreen`'s socket connection, and
// a pull gesture stacked on the board's own drag/tap interactions for picks
// would compete with them rather than help — see the ticket's Open Questions.
export default function DraftBoardPage() {
  const { leagueId: leagueIdParam } = useLocalSearchParams();
  const router = useRouter();
  const leagueId = toIntId(leagueIdParam);
  const websocketUrl = config.websocketUrl;
  // This route is pushed on top of the root Stack, outside the `(tabs)` group,
  // so nothing above it reserves the Android edge-to-edge navigation-bar inset
  // the way React Navigation's tab bar does for the tab shell — the draft
  // room's own bottom nav has to reserve it itself (LS-9444). `(app)/_layout`
  // already supplies the matching top inset via the Stack's `contentStyle`.
  const { bottom: bottomInset } = useSafeAreaInsets();

  useEffect(() => {
    if (!websocketUrl) {
      LOGGER.error(
        'EXPO_PUBLIC_WEBSOCKET_URL is not configured — falling back to polling for live draft updates',
      );
    }
  }, [websocketUrl]);

  return (
    // Mandatory navigation-landing anchor for the Maestro live-draft-board flow
    // (LS-8446): a stable container present across every draft state so tapping
    // the draft-status chip fails the flow loudly if the board never mounts.
    <YStack flex={1} testID="elite-draft-board-screen">
      {!websocketUrl && (
        <YStack backgroundColor="$yellow4" padding="$2">
          <Text color="$yellow11" textAlign="center" fontSize="$2">
            Real-time updates unavailable — polling for picks every 5s
          </Text>
        </YStack>
      )}
      <EliteDraftBoardScreen
        leagueId={leagueId}
        onNavigate={(path) => router.navigate(path)}
        websocketUrl={websocketUrl ?? ''}
        bottomInset={bottomInset}
      />
    </YStack>
  );
}
export { ScreenErrorBoundary as ErrorBoundary } from './_screenErrorBoundary';
