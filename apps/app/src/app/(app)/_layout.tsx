import { Redirect, Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandedSplash } from '@legacy-sports/shared-components';
import { colors } from '@legacy-sports/design-tokens';

import { AuthorizedUserContextProvider } from '../../common/auth/AuthorizedUserContext';
import { useCurrentUserInfo } from '../../common/auth/AuthHooks';
import { usePushNotifications } from '../../features/notifications/hooks/usePushNotifications';
import { useThemeContext } from '../../context/ThemeContext';

// The authenticated app lands on the five-tab shell. `/` redirects there via
// `index`, so the tab group is the anchor of the navigation stack and every
// other screen (league context, settings, detail screens) is pushed on top of
// it. No screen renders a navigation header: back navigation is handled
// entirely by Android's system back button / edge-swipe gesture (LS-8766). The
// legacy flat drawer was removed — see docs/architecture/mobile-navigation.md.
export const unstable_settings = {
  initialRouteName: '(tabs)',
};

export default function Layout() {
  const { data: currentUser, loading } = useCurrentUserInfo();
  const { resolvedTheme } = useThemeContext();
  const insets = useSafeAreaInsets();
  // React Navigation paints the scene (content) background itself and defaults
  // it to white regardless of the active theme, so pushed screens that don't
  // paint their own full-bleed background (e.g. the league-detail shell, which
  // gets its page background from web-only `.ls-root` CSS that native ignores)
  // render dark cards on a white scene in dark mode. Theme the content
  // background from the same design-token palette the tab bar reads.
  const palette = colors[resolvedTheme];

  usePushNotifications(currentUser?.id ?? null);

  if (loading) {
    return <BrandedSplash />;
  }

  if (!currentUser) {
    return <Redirect href="/login" />;
  }

  return (
    <AuthorizedUserContextProvider>
      <GestureHandlerRootView testID="gesture-handler" style={{ flex: 1 }}>
        <Stack
          screenOptions={{
            // Every route in this group is headerless (LS-8766). The native
            // header used to supply the status-bar inset for pushed screens,
            // so the scene now pads itself instead.
            headerShown: false,
            contentStyle: {
              backgroundColor: palette.surface.bg,
              paddingTop: insets.top,
            },
          }}
        >
          {/* The tab shell and the `/` redirect own their own safe-area
              handling (each tab screen reads `useSafeAreaInsets` directly), so
              they opt out of the scene-level top padding to avoid doubling it.
              `contentStyle` is replaced wholesale rather than merged, so the
              background has to be restated here. */}
          <Stack.Screen
            name="(tabs)"
            options={{
              contentStyle: { backgroundColor: palette.surface.bg },
            }}
          />
          <Stack.Screen
            name="index"
            options={{
              contentStyle: { backgroundColor: palette.surface.bg },
            }}
          />
        </Stack>
      </GestureHandlerRootView>
    </AuthorizedUserContextProvider>
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from './_screenErrorBoundary';
