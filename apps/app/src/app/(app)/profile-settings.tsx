import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import {
  Button,
  H1,
  Paragraph,
  Separator,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import {
  useAuthHandlers,
  useCurrentUserInfo,
} from '../../common/auth/AuthHooks';

const BRAND_GOLD_LIGHT = '#C5A55A';
const BRAND_NAVY_LIGHT = '#2C4A7C';
const BRAND_SEAM_RED = '#C41E3A';

function getAccessLevelLabel(level: string): string {
  switch (level) {
    case 'admin':
      return 'Administrator';
    case 'user':
      return 'Member';
    default:
      return 'Limited';
  }
}

export default function ProfileSettingsScreen(): React.JSX.Element {
  const { data: currentUser } = useCurrentUserInfo();
  const { logout } = useAuthHandlers();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = () => {
    setLoggingOut(true);
    try {
      logout();
    } finally {
      setLoggingOut(false);
    }
  };

  const userName = currentUser?.username ?? '';
  const userEmail = currentUser?.email ?? '';
  const isAdmin = currentUser?.isAdmin ?? false;
  const userId = currentUser?.id;

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
          <H1
            style={{
              fontSize: 32,
              fontWeight: '700',
              color: BRAND_GOLD_LIGHT,
            }}
          >
            Profile Settings
          </H1>
          <Paragraph size="$4" color="$colorPress">
            Manage your account information and preferences.
          </Paragraph>
        </YStack>

        {/* Profile Card */}
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
            <YStack
              width={36}
              height={36}
              borderRadius="$4"
              alignItems="center"
              justifyContent="center"
              backgroundColor="$color2"
            >
              <Text fontSize={16}>👤</Text>
            </YStack>
            <YStack flex={1}>
              <Paragraph size="$4" color="$color" fontWeight="600">
                Profile
              </Paragraph>
              <Paragraph size="$2" color="$colorPress">
                Your public identity on Legacy Sports
              </Paragraph>
            </YStack>
          </XStack>

          <YStack padding="$5" gap="$4">
            {/* Avatar + Name Summary */}
            <XStack gap="$4" alignItems="center">
              <YStack
                width={72}
                height={72}
                borderRadius="$12"
                alignItems="center"
                justifyContent="center"
                borderWidth={3}
                borderColor={BRAND_NAVY_LIGHT}
                backgroundColor={BRAND_NAVY_LIGHT}
                flexShrink={0}
              >
                <Text
                  style={{
                    fontSize: 28,
                    fontWeight: '700',
                    color: 'white',
                    lineHeight: 32,
                  }}
                >
                  {userName.charAt(0).toUpperCase() || '?'}
                </Text>
              </YStack>
              <YStack gap="$2" flex={1}>
                <Text
                  style={{
                    fontSize: 20,
                    fontWeight: '700',
                    color: BRAND_GOLD_LIGHT,
                  }}
                >
                  {userName}
                </Text>
                {userEmail ? (
                  <Paragraph size="$3" color="$colorPress">
                    {userEmail}
                  </Paragraph>
                ) : null}
                <XStack
                  alignItems="center"
                  paddingHorizontal="$3"
                  paddingVertical="$1"
                  borderRadius="$10"
                  borderWidth={1}
                  alignSelf="flex-start"
                  borderColor={isAdmin ? BRAND_SEAM_RED : BRAND_NAVY_LIGHT}
                  backgroundColor={
                    isAdmin ? 'rgba(196,30,58,0.1)' : 'rgba(44,74,124,0.1)'
                  }
                >
                  <Paragraph
                    size="$2"
                    fontWeight="600"
                    color={isAdmin ? BRAND_SEAM_RED : BRAND_GOLD_LIGHT}
                  >
                    {getAccessLevelLabel(isAdmin ? 'admin' : 'user')}
                  </Paragraph>
                </XStack>
              </YStack>
            </XStack>

            <Separator />

            {/* Fields */}
            <YStack gap="$3">
              <XStack alignItems="center" gap="$4">
                <Paragraph
                  size="$3"
                  color="$colorPress"
                  fontWeight="500"
                  width={120}
                >
                  Username
                </Paragraph>
                <Paragraph size="$4" color="$color" flex={1}>
                  {userName}
                </Paragraph>
              </XStack>
              {userEmail ? (
                <XStack alignItems="center" gap="$4">
                  <Paragraph
                    size="$3"
                    color="$colorPress"
                    fontWeight="500"
                    width={120}
                  >
                    Email
                  </Paragraph>
                  <Paragraph size="$4" color="$color" flex={1}>
                    {userEmail}
                  </Paragraph>
                </XStack>
              ) : null}
              {userId != null ? (
                <XStack alignItems="center" gap="$4">
                  <Paragraph
                    size="$3"
                    color="$colorPress"
                    fontWeight="500"
                    width={120}
                  >
                    User ID
                  </Paragraph>
                  <Paragraph size="$4" color="$colorPress" flex={1}>
                    #{userId}
                  </Paragraph>
                </XStack>
              ) : null}
            </YStack>

            {/* Read-only notice */}
            <XStack
              alignItems="flex-start"
              gap="$3"
              padding="$4"
              borderRadius="$5"
              borderWidth={1}
              borderColor={`${BRAND_NAVY_LIGHT}55`}
              backgroundColor={`${BRAND_NAVY_LIGHT}1A`}
            >
              <Text fontSize={16} style={{ flexShrink: 0 }}>
                ℹ️
              </Text>
              <Paragraph size="$3" color="$colorPress" flex={1}>
                Profile details are managed through your Google account. To
                update your name or profile photo, visit your Google Account
                settings.
              </Paragraph>
            </XStack>
          </YStack>
        </YStack>

        {/* Account & Security */}
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
            <YStack
              width={36}
              height={36}
              borderRadius="$4"
              alignItems="center"
              justifyContent="center"
              backgroundColor="$color2"
            >
              <Text fontSize={16}>🔒</Text>
            </YStack>
            <YStack flex={1}>
              <Paragraph size="$4" color="$color" fontWeight="600">
                Account & Security
              </Paragraph>
              <Paragraph size="$2" color="$colorPress">
                Authentication method and session details
              </Paragraph>
            </YStack>
          </XStack>

          <YStack padding="$5" gap="$3">
            <XStack alignItems="center" gap="$4">
              <Paragraph
                size="$3"
                color="$colorPress"
                fontWeight="500"
                width={120}
              >
                Sign-in Method
              </Paragraph>
              <XStack alignItems="center" gap="$2">
                <Text fontSize={16}>🌐</Text>
                <Paragraph size="$4" color="$color">
                  Google OAuth
                </Paragraph>
              </XStack>
            </XStack>
            <XStack alignItems="center" gap="$4">
              <Paragraph
                size="$3"
                color="$colorPress"
                fontWeight="500"
                width={120}
              >
                Session
              </Paragraph>
              <XStack alignItems="center" gap="$2">
                <YStack
                  width={8}
                  height={8}
                  borderRadius={4}
                  backgroundColor="rgb(34,197,94)"
                />
                <Paragraph size="$4" color="$color">
                  Active
                </Paragraph>
              </XStack>
            </XStack>
          </YStack>
        </YStack>

        {/* Sign Out */}
        <YStack
          borderRadius="$6"
          borderWidth={1}
          borderColor={`${BRAND_SEAM_RED}40`}
          overflow="hidden"
        >
          <XStack
            paddingHorizontal="$5"
            paddingVertical="$4"
            alignItems="center"
            gap="$3"
            borderBottomWidth={1}
            borderBottomColor={`${BRAND_SEAM_RED}30`}
          >
            <YStack
              width={36}
              height={36}
              borderRadius="$4"
              alignItems="center"
              justifyContent="center"
              backgroundColor={`${BRAND_SEAM_RED}1A`}
            >
              <Text fontSize={16}>🚪</Text>
            </YStack>
            <YStack flex={1}>
              <Paragraph size="$4" fontWeight="600" color={BRAND_SEAM_RED}>
                Session
              </Paragraph>
              <Paragraph size="$2" color="$colorPress">
                Sign out of your account
              </Paragraph>
            </YStack>
          </XStack>

          <YStack padding="$5" gap="$3">
            <XStack alignItems="center" justifyContent="space-between" gap="$4">
              <YStack gap="$1" flex={1}>
                <Paragraph size="$4" color="$color" fontWeight="500">
                  Sign out
                </Paragraph>
                <Paragraph size="$3" color="$colorPress">
                  You will be signed out and redirected to the login page.
                </Paragraph>
              </YStack>
              <Button
                backgroundColor={BRAND_SEAM_RED}
                color="white"
                onPress={handleLogout}
                disabled={loggingOut}
                paddingHorizontal="$5"
              >
                {loggingOut ? 'Signing out...' : 'Sign Out'}
              </Button>
            </XStack>
          </YStack>
        </YStack>
      </YStack>
    </ScrollView>
  );
}
