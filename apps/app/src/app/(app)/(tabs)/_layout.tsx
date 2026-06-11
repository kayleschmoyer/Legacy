import { Tabs } from 'expo-router';
import { useGetUnreadNotificationCountQuery } from '../../../api/db/graphql.generated';

export default function TabsLayout() {
  const { data: unreadData } = useGetUnreadNotificationCountQuery();
  const unreadCount = unreadData?.getUnreadNotificationCount ?? 0;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#1B3A5C',
        tabBarInactiveTintColor: '#8A9BB0',
        tabBarStyle: {
          backgroundColor: '#f5f5f5',
          borderTopColor: '#E2E8F0',
        },
        tabBarLabelStyle: {
          fontSize: 11,
        },
        // expo-router defaults allowFontScaling=false on iOS 13+ (LS-7573).
        // Explicitly re-enable so Dynamic Type / Android font scaling is respected.
        tabBarAllowFontScaling: true,
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="leagues" options={{ title: 'Leagues' }} />
      <Tabs.Screen name="players" options={{ title: 'Players' }} />
      <Tabs.Screen name="games" options={{ title: 'Games' }} />
      <Tabs.Screen
        name="you"
        options={{
          title: 'You',
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
        }}
      />
    </Tabs>
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';
