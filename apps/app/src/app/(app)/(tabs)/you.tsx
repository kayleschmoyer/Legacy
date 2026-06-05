import React, { useState } from 'react';
import { Platform, ScrollView } from 'react-native';
import { Paragraph, Separator, Text, XStack, YStack } from 'tamagui';
import { useRouter } from 'expo-router';
import { useAuthHandlers } from '../../../common/auth/AuthHooks';
import { useGetUnreadNotificationCountQuery } from '../../../api/db/graphql.generated';

const BRAND_GOLD = '#C5A55A';
const BRAND_SEAM_RED = '#C41E3A';

interface MenuRowProps {
  icon: string;
  label: string;
  onPress: () => void;
  badge?: number;
  danger?: boolean;
  testID?: string;
}

function MenuRow({
  icon,
  label,
  onPress,
  badge,
  danger,
  testID,
}: MenuRowProps) {
  return (
    <XStack
      testID={testID}
      paddingHorizontal="$5"
      paddingVertical="$4"
      alignItems="center"
      gap="$4"
      onPress={onPress}
      pressStyle={{ backgroundColor: '$gray3' }}
      accessibilityRole="button"
    >
      <YStack
        width={36}
        height={36}
        borderRadius="$4"
        alignItems="center"
        justifyContent="center"
        backgroundColor={danger ? 'rgba(196,30,58,0.12)' : '$color2'}
      >
        <Text fontSize={18}>{icon}</Text>
      </YStack>
      <Paragraph
        size="$4"
        color={danger ? BRAND_SEAM_RED : '$color'}
        fontWeight="500"
        flex={1}
      >
        {label}
      </Paragraph>
      {badge != null && badge > 0 ? (
        <XStack
          backgroundColor="$red10"
          borderRadius="$10"
          paddingHorizontal="$2"
          paddingVertical="$0.5"
          minWidth={22}
          alignItems="center"
          justifyContent="center"
        >
          <Text fontSize="$1" fontWeight="700" color="white" textAlign="center">
            {badge > 99 ? '99+' : badge}
          </Text>
        </XStack>
      ) : !danger ? (
        <Text fontSize="$4" color="$colorSubtle">
          {'›'}
        </Text>
      ) : null}
    </XStack>
  );
}

export default function YouTab(): React.JSX.Element {
  const router = useRouter();
  const { logout } = useAuthHandlers();
  const [loggingOut, setLoggingOut] = useState(false);
  const { data: unreadData } = useGetUnreadNotificationCountQuery();
  const unreadCount = unreadData?.getUnreadNotificationCount ?? 0;

  const handleLogout = () => {
    setLoggingOut(true);
    void logout().finally(() => {
      setLoggingOut(false);
    });
  };

  return (
    <ScrollView>
      <YStack backgroundColor="$background" minHeight="100%">
        <YStack
          paddingHorizontal="$5"
          paddingTop="$6"
          paddingBottom="$4"
          gap="$1"
        >
          <Text style={{ fontSize: 28, fontWeight: '700', color: BRAND_GOLD }}>
            You
          </Text>
          <Paragraph size="$3" color="$colorPress">
            Account &amp; settings
          </Paragraph>
        </YStack>

        {/* Account */}
        <YStack
          marginHorizontal="$4"
          borderRadius="$6"
          borderWidth={1}
          borderColor="$borderColor"
          overflow="hidden"
          marginBottom="$4"
        >
          <MenuRow
            testID="you-profile"
            icon="👤"
            label="Profile"
            onPress={() => router.navigate('profile-settings')}
          />
          <Separator marginHorizontal="$4" />
          <MenuRow
            testID="you-preferences"
            icon="🎨"
            label="Preferences"
            onPress={() => router.navigate('preferences')}
          />
          <Separator marginHorizontal="$4" />
          <MenuRow
            testID="you-notifications"
            icon="🔔"
            label="Notifications"
            badge={unreadCount}
            onPress={() => router.navigate('notifications')}
          />
          <Separator marginHorizontal="$4" />
          <MenuRow
            testID="you-billing"
            icon="💎"
            label="Billing &amp; Subscription"
            onPress={() => router.navigate('subscription-settings')}
          />
        </YStack>

        {/* Support */}
        <YStack
          marginHorizontal="$4"
          borderRadius="$6"
          borderWidth={1}
          borderColor="$borderColor"
          overflow="hidden"
          marginBottom="$4"
        >
          <MenuRow
            testID="you-help"
            icon="❓"
            label="Help &amp; Support"
            onPress={() => router.navigate('help')}
          />
          <Separator marginHorizontal="$4" />
          <MenuRow
            testID="you-about"
            icon="ℹ️"
            label="About"
            onPress={() => router.navigate('about')}
          />
          {Platform.OS === 'android' ? (
            <>
              <Separator marginHorizontal="$4" />
              <MenuRow
                testID="you-update-check"
                icon="📲"
                label="Check for Updates"
                onPress={() => router.navigate('update-check')}
              />
            </>
          ) : null}
        </YStack>

        {/* Sign Out */}
        <YStack
          marginHorizontal="$4"
          borderRadius="$6"
          borderWidth={1}
          borderColor="rgba(196,30,58,0.3)"
          overflow="hidden"
          marginBottom="$6"
        >
          <MenuRow
            testID="you-logout"
            icon="🚪"
            label={loggingOut ? 'Signing out…' : 'Sign Out'}
            onPress={handleLogout}
            danger
          />
        </YStack>
      </YStack>
    </ScrollView>
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';
