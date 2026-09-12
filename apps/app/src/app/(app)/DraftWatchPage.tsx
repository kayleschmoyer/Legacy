import React, { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import {
  SpectatorScreen,
  type SpectatorScreenProps,
} from '@legacy-sports/shared-components';
import { LOGGER } from '@legacy-sports/logging';
import { config } from '@legacy-sports/app-config/native';
import { toIntId } from '../../common/utilities/RouteUtils';
import { readKeychainValue, Secret } from '../../common/auth/AuthHooks';

// The `@legacy-sports/shared-components` barrel exports `SpectatorScreenProps`
// from the web `SpectatorScreen.tsx` (tsc has no notion of Metro's `.native.tsx`
// platform-resolution), but `SpectatorScreen.native.tsx` — the component this
// app actually renders — additionally accepts `websocketToken` for its own WS
// auth. Widen the type at this call site rather than editing the shared barrel,
// which would affect web.
type NativeSpectatorScreenProps = SpectatorScreenProps & {
  websocketToken?: string;
};
const NativeSpectatorScreen =
  SpectatorScreen as React.ComponentType<NativeSpectatorScreenProps>;

// Thin native wrapper for the shared SpectatorScreen (LS-8944). Pushed on top
// of the root Stack outside the `(tabs)` group, so it inherits the app-wide
// `headerShown: false` from `(app)/_layout.tsx` and has no tab bar to hide —
// same convention as DraftBoardPage. `useKeepAwake` prevents the screen from
// sleeping for the big-screen/tablet in-person-draft use case.
export default function DraftWatchPage() {
  const { leagueId: leagueIdParam } = useLocalSearchParams();
  const router = useRouter();
  const leagueId = toIntId(leagueIdParam);
  const websocketUrl = config.websocketUrl;
  const [wsToken, setWsToken] = useState<string | undefined>();

  useKeepAwake('draft-watch');

  useEffect(() => {
    if (!websocketUrl) {
      LOGGER.error(
        'EXPO_PUBLIC_WEBSOCKET_URL is not configured — spectator draft watch requires realtime updates',
      );
    }
  }, [websocketUrl]);

  // Mirrors the token read in baseball/league/[leagueId].tsx: the internal JWT
  // authenticates the spectator WebSocket connection for both league members
  // and signed-in non-members watching a public league's draft.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const token = await readKeychainValue(Secret.INTERNAL_JWT);
        if (active && token) setWsToken(token);
      } catch (err: unknown) {
        LOGGER.error(
          'Failed to read WS token from keychain',
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <NativeSpectatorScreen
      leagueId={leagueId}
      onNavigate={(path) => router.navigate(path)}
      websocketUrl={websocketUrl ?? ''}
      websocketToken={wsToken}
    />
  );
}
export { ScreenErrorBoundary as ErrorBoundary } from './_screenErrorBoundary';
