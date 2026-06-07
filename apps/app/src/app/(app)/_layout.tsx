import { Redirect, Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { UnifiedLoadingPanel } from '@legacy-sports/shared-components';

import { LeagueIdHeader } from './baseball/league/[leagueId]';
import { FootballLeagueIdHeader } from './football/league/[leagueId]';
import { LeagueContextHeader } from './league/[leagueId]';
import { TeamIdHeader } from './baseball/team/[teamId]';
import { FootballTeamHeader } from './football/team/[teamId]';
import { AuthorizedUserContextProvider } from '../../common/auth/AuthorizedUserContext';
import { useCurrentUserInfo } from '../../common/auth/AuthHooks';
import { usePushNotifications } from '../../features/notifications/hooks/usePushNotifications';

// The authenticated app lands on the five-tab shell. `/` redirects there via
// `index`, so the tab group is the anchor of the navigation stack and every
// other screen (league context, settings, detail screens) is pushed on top of
// it with a standard back affordance. The legacy flat drawer was removed — see
// docs/architecture/mobile-navigation.md.
export const unstable_settings = {
  initialRouteName: '(tabs)',
};

export default function Layout() {
  const { data: currentUser, loading } = useCurrentUserInfo();

  usePushNotifications(currentUser?.id ?? null);

  if (loading) {
    return <UnifiedLoadingPanel />;
  }

  if (!currentUser) {
    return <Redirect href="/login" />;
  }

  return (
    <AuthorizedUserContextProvider>
      <GestureHandlerRootView testID="gesture-handler" style={{ flex: 1 }}>
        <Stack
          screenOptions={{
            headerStyle: {
              backgroundColor: '#f5f5f5',
            },
          }}
        >
          {/* Landing: tab navigator owns its own headers */}
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          {/* `/` redirects into the tab group — no header flash */}
          <Stack.Screen name="index" options={{ headerShown: false }} />

          {/* Sport home screens */}
          <Stack.Screen
            name="baseball/index"
            options={{ title: 'Baseball Home' }}
          />
          <Stack.Screen
            name="football/index"
            options={{ title: 'Football Home' }}
          />

          {/* Live scoreboard */}
          <Stack.Screen
            name="baseball/scoreboard"
            options={{ title: 'MLB Scoreboard' }}
          />

          {/* League onboarding */}
          <Stack.Screen
            name="baseball/league/create"
            options={{ headerShown: true, headerTitle: 'Create League' }}
          />
          <Stack.Screen
            name="football/league/create"
            options={{
              headerShown: true,
              headerTitle: 'Create Football League',
            }}
          />
          <Stack.Screen
            name="baseball/league/join"
            options={{ title: 'Join League' }}
          />
          <Stack.Screen
            name="football/league/join"
            options={{ title: 'Join Football League' }}
          />
          <Stack.Screen
            name="league-discovery"
            options={{ title: 'Browse Leagues' }}
          />

          {/* League context + detail screens */}
          <Stack.Screen
            name="league/[leagueId]"
            options={{ headerTitle: LeagueContextHeader }}
          />
          <Stack.Screen
            name="baseball/league/[leagueId]"
            options={{ headerTitle: LeagueIdHeader }}
          />
          <Stack.Screen
            name="football/league/[leagueId]"
            options={{ headerTitle: FootballLeagueIdHeader }}
          />
          <Stack.Screen
            name="baseball/team/[teamId]"
            options={{
              headerShown: true,
              headerTitle: () => <TeamIdHeader />,
            }}
          />
          <Stack.Screen
            name="football/team/[teamId]"
            options={{
              headerShown: true,
              headerTitle: () => <FootballTeamHeader />,
            }}
          />
          <Stack.Screen
            name="baseball/matchup"
            options={{ title: 'Matchup Detail' }}
          />
          <Stack.Screen
            name="football/matchup"
            options={{ title: 'Matchup Detail' }}
          />
          <Stack.Screen
            name="DraftBoardPage"
            options={{ title: 'Draft Board' }}
          />
          <Stack.Screen name="FreeAgents" options={{ title: 'Free Agents' }} />
          <Stack.Screen
            name="PlayerStats"
            options={{ title: 'Player Statistics' }}
          />
          <Stack.Screen
            name="PlayerDetail"
            options={{ title: 'Player Details' }}
          />
          <Stack.Screen name="DirectMessages" options={{ title: 'Messages' }} />
          <Stack.Screen name="management" options={{ title: 'Management' }} />

          {/* Games */}
          <Stack.Screen name="games/index" options={{ title: 'Minigames' }} />
          <Stack.Screen
            name="disclosure-game/index"
            options={{ title: 'Who Am I?' }}
          />
          <Stack.Screen
            name="season-draft/index"
            options={{ title: 'Season Draft Games' }}
          />
          <Stack.Screen
            name="season-draft/[gameId]"
            options={{ title: 'Season Draft Game' }}
          />
          <Stack.Screen
            name="season-draft/create"
            options={{ title: 'Create Season Draft Game' }}
          />
          <Stack.Screen
            name="season-draft/join"
            options={{ title: 'Join Season Draft Game' }}
          />

          {/* Account / settings */}
          <Stack.Screen name="about" options={{ title: 'About' }} />
          <Stack.Screen name="help" options={{ title: 'Help & Support' }} />
          <Stack.Screen
            name="profile-settings"
            options={{ title: 'Profile Settings' }}
          />
          <Stack.Screen name="preferences" options={{ title: 'Preferences' }} />
          <Stack.Screen
            name="notifications"
            options={{ title: 'Notifications' }}
          />
          <Stack.Screen
            name="subscription-settings"
            options={{ title: 'Subscription & Billing' }}
          />
          <Stack.Screen
            name="update-check"
            options={{ title: 'Check for Updates' }}
          />
        </Stack>
      </GestureHandlerRootView>
    </AuthorizedUserContextProvider>
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from './_screenErrorBoundary';
