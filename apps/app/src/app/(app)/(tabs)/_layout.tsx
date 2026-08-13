import { Gamepad2 } from '@tamagui/lucide-icons/icons/Gamepad2';
import { Home } from '@tamagui/lucide-icons/icons/Home';
import { Trophy } from '@tamagui/lucide-icons/icons/Trophy';
import { User } from '@tamagui/lucide-icons/icons/User';
import { Users } from '@tamagui/lucide-icons/icons/Users';
import { Tabs } from 'expo-router';
import { useGetUnreadNotificationCountQuery } from '@legacy-sports/graphql';
import { colors } from '@legacy-sports/design-tokens';
import { useThemeContext } from '../../../context/ThemeContext';

export default function TabsLayout() {
  const { data: unreadData } = useGetUnreadNotificationCountQuery();
  const unreadCount = unreadData?.getUnreadNotificationCount ?? 0;
  // React Navigation's tab bar takes plain style objects (not Tamagui
  // `$token` strings), so we read resolved values from the design-token
  // package — the same source of truth the Tamagui themes mirror — keyed by
  // the active light/dark theme.
  const { resolvedTheme } = useThemeContext();
  const palette = colors[resolvedTheme];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.text.fg1,
        tabBarInactiveTintColor: palette.text.fg3,
        tabBarStyle: {
          backgroundColor: palette.surface.bg,
          borderTopColor: palette.surface.panelBorder,
        },
        tabBarLabelStyle: {
          fontSize: 11,
        },
        // expo-router defaults allowFontScaling=false on iOS 13+ (LS-7573).
        // Explicitly re-enable so Dynamic Type / Android font scaling is respected.
        tabBarAllowFontScaling: true,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="leagues"
        options={{
          title: 'Leagues',
          tabBarIcon: ({ color, size }) => <Trophy color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="players"
        options={{
          title: 'Players',
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="games"
        options={{
          title: 'Games',
          tabBarIcon: ({ color, size }) => (
            <Gamepad2 color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="you"
        options={{
          title: 'You',
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';
