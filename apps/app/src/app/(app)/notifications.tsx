import React from 'react';
import { ScrollView } from 'react-native';
import { H1, H3, Separator, Spinner, Text, XStack, YStack } from 'tamagui';
import { NotificationList } from '../../features/notifications/components/NotificationList';
import { NotificationSettings } from '../../features/notifications/components/NotificationSettings';
import { useNotifications } from '../../features/notifications/hooks/useNotifications';
import { useAuthorizedUserInfo } from '../../common/auth/AuthorizedUserContext';

const BRAND_GOLD_LIGHT = '#C5A55A';

export default function NotificationsScreen(): React.JSX.Element {
  const userInfo = useAuthorizedUserInfo();

  const {
    notifications,
    preferences,
    loading,
    markAsRead,
    markAllAsRead,
    updatePreferences,
  } = useNotifications(userInfo.id);

  if (loading) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" padding="$4">
        <Spinner size="large" />
        <Text marginTop="$3" color="$gray11">
          Loading notifications...
        </Text>
      </YStack>
    );
  }

  return (
    <ScrollView>
      <YStack
        padding="$5"
        gap="$6"
        backgroundColor="$background"
        minHeight="100%"
      >
        {/* Page Header */}
        <YStack gap="$2" paddingVertical="$4">
          <H1 color={BRAND_GOLD_LIGHT}>🔔 Notifications</H1>
          <Text color="$colorPress" fontSize="$5">
            Stay updated on league activity, trades, and more.
          </Text>
        </YStack>

        {/* Notification Settings */}
        {preferences && (
          <YStack
            borderRadius="$6"
            borderWidth={1}
            borderColor="$borderColor"
            overflow="hidden"
          >
            <XStack
              paddingHorizontal="$5"
              paddingVertical="$4"
              alignItems="center"
              gap="$3"
              borderBottomWidth={1}
              borderBottomColor="$borderColor"
            >
              <H3 color="$color">Notification Preferences</H3>
            </XStack>
            <YStack padding="$4">
              <NotificationSettings
                preferences={preferences}
                onUpdate={updatePreferences}
              />
            </YStack>
          </YStack>
        )}

        <Separator />

        {/* Notification History */}
        <YStack
          borderRadius="$6"
          borderWidth={1}
          borderColor="$borderColor"
          overflow="hidden"
        >
          <XStack
            paddingHorizontal="$5"
            paddingVertical="$4"
            alignItems="center"
            gap="$3"
            borderBottomWidth={1}
            borderBottomColor="$borderColor"
          >
            <H3 color="$color">Recent Notifications</H3>
          </XStack>
          <YStack padding="$2">
            <NotificationList
              notifications={notifications}
              onMarkAsRead={markAsRead}
              onMarkAllRead={markAllAsRead}
            />
          </YStack>
        </YStack>
      </YStack>
    </ScrollView>
  );
}
