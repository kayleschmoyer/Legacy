import React, { useCallback, useState } from 'react';
import { ScrollView } from 'react-native';
import {
  Button,
  H1,
  Input,
  Paragraph,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { useRouter } from 'expo-router';
import { AvatarImage, AvatarPicker } from '@legacy-sports/shared-components';
import { LOGGER } from '@legacy-sports/logging';
import {
  useAuthHandlers,
  useCurrentUserInfo,
} from '../../common/auth/AuthHooks';
import { useSubscription } from '../../features/subscription';
import {
  useGetUserByIdQuery,
  useUpdateUserAvatarMutation,
  useUpdateUsernameMutation,
} from '../../api/db/graphql.generated';

const BRAND_GOLD_LIGHT = '#C5A55A';
const BRAND_NAVY_LIGHT = '#2C4A7C';
const BRAND_SEAM_RED = '#C41E3A';

const USERNAME_REGEX = /^[a-zA-Z0-9_.-]{3,50}$/;

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
  const { isPremium, tier } = useSubscription();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  // Fetch full user data (including avatarUrl)
  const userId = currentUser?.id;
  const { data: userData, refetch: refetchUser } = useGetUserByIdQuery({
    variables: { id: userId ?? 0 },
    skip: !userId,
  });
  const user = userData?.user;

  // Username editing state
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [updateUsername, { loading: updatingUsername }] =
    useUpdateUsernameMutation();

  // Avatar editing state
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [updateAvatar, { loading: updatingAvatar }] =
    useUpdateUserAvatarMutation();

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  };

  const handleStartEditUsername = useCallback(() => {
    setUsernameInput(user?.username ?? currentUser?.username ?? '');
    setUsernameError(null);
    setEditingUsername(true);
  }, [user?.username, currentUser?.username]);

  const handleSaveUsername = useCallback(async () => {
    const trimmed = usernameInput.trim();
    if (!USERNAME_REGEX.test(trimmed)) {
      setUsernameError(
        'Username must be 3-50 characters: letters, numbers, _, -, or .',
      );
      return;
    }
    try {
      await updateUsername({ variables: { username: trimmed } });
      await refetchUser();
      setEditingUsername(false);
      setUsernameError(null);
    } catch (err) {
      LOGGER.error('Failed to update username:', String(err));
      setUsernameError('Failed to update username. It may already be taken.');
    }
  }, [usernameInput, updateUsername, refetchUser]);

  const handleAvatarSelect = useCallback(
    async (url: string | null) => {
      try {
        await updateAvatar({ variables: { avatarUrl: url } });
        await refetchUser();
        setShowAvatarPicker(false);
      } catch (err) {
        LOGGER.error('Failed to update avatar:', String(err));
      }
    },
    [updateAvatar, refetchUser],
  );

  const userName = user?.username ?? currentUser?.username ?? '';
  const userEmail = user?.email ?? currentUser?.email ?? '';
  const isAdmin =
    user?.accessLevel === 'admin' || (currentUser?.isAdmin ?? false);
  const avatarUrl = user?.avatarUrl ?? null;

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
              <Text fontSize={16}>{'\u{1F464}'}</Text>
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
                onPress={() => setShowAvatarPicker(!showAvatarPicker)}
                accessibilityRole="button"
                accessibilityLabel="Edit avatar"
              >
                <AvatarImage
                  url={avatarUrl}
                  username={userName}
                  size={72}
                  borderRadius={36}
                />
                <YStack
                  position="absolute"
                  bottom={0}
                  right={0}
                  width={24}
                  height={24}
                  borderRadius={12}
                  backgroundColor={BRAND_NAVY_LIGHT}
                  alignItems="center"
                  justifyContent="center"
                  borderWidth={2}
                  borderColor="$background"
                >
                  <Text fontSize={12}>{'\u270F\uFE0F'}</Text>
                </YStack>
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

            {/* Avatar Picker (expandable) */}
            {showAvatarPicker && (
              <YStack
                borderRadius="$5"
                borderWidth={1}
                borderColor="$borderColor"
                overflow="hidden"
              >
                <AvatarPicker
                  currentUrl={avatarUrl}
                  variant="user"
                  onSelect={(url: string | null) =>
                    void handleAvatarSelect(url)
                  }
                  loading={updatingAvatar}
                  username={userName}
                />
              </YStack>
            )}

            <Separator />

            {/* Username field */}
            <YStack gap="$2">
              <XStack alignItems="center" justifyContent="space-between">
                <Paragraph
                  size="$3"
                  color="$colorPress"
                  fontWeight="500"
                  width={120}
                >
                  Username
                </Paragraph>
                {editingUsername ? (
                  <XStack gap="$2" flex={1} alignItems="center">
                    <Input
                      flex={1}
                      size="$3"
                      value={usernameInput}
                      onChangeText={setUsernameInput}
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder="username"
                    />
                    <Button
                      size="$2"
                      theme="blue"
                      onPress={() => void handleSaveUsername()}
                      disabled={updatingUsername}
                      icon={
                        updatingUsername ? <Spinner size="small" /> : undefined
                      }
                    >
                      Save
                    </Button>
                    <Button
                      size="$2"
                      chromeless
                      onPress={() => setEditingUsername(false)}
                    >
                      Cancel
                    </Button>
                  </XStack>
                ) : (
                  <XStack flex={1} alignItems="center" gap="$2">
                    <Paragraph size="$4" color="$color" flex={1}>
                      {userName}
                    </Paragraph>
                    <Button
                      size="$2"
                      chromeless
                      color={BRAND_NAVY_LIGHT}
                      onPress={handleStartEditUsername}
                    >
                      Edit
                    </Button>
                  </XStack>
                )}
              </XStack>
              {usernameError && (
                <Text fontSize="$2" color="$red10" paddingLeft={120}>
                  {usernameError}
                </Text>
              )}
            </YStack>

            {/* Email field (read-only) */}
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
              <Text fontSize={16}>{'\u{1F512}'}</Text>
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
                <Text fontSize={16}>{'\u{1F310}'}</Text>
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

        {/* Subscription & Billing */}
        <YStack
          borderRadius="$6"
          borderWidth={1}
          borderColor={isPremium ? `${BRAND_GOLD_LIGHT}4D` : '$borderColor'}
          overflow="hidden"
        >
          <XStack
            paddingHorizontal="$5"
            paddingVertical="$4"
            alignItems="center"
            gap="$3"
            borderBottomWidth={1}
            borderBottomColor="$borderColor"
            onPress={() => router.navigate('subscription-settings')}
            pressStyle={{ backgroundColor: '$gray3' }}
            accessibilityRole="button"
            accessibilityLabel="Subscription and billing settings"
          >
            <YStack
              width={36}
              height={36}
              borderRadius="$4"
              alignItems="center"
              justifyContent="center"
              backgroundColor={isPremium ? `${BRAND_GOLD_LIGHT}33` : '$color2'}
            >
              <Text fontSize={16}>{isPremium ? '\u2B50' : '\u{1F48E}'}</Text>
            </YStack>
            <YStack flex={1}>
              <Paragraph size="$4" color="$color" fontWeight="600">
                Subscription & Billing
              </Paragraph>
              <Paragraph size="$2" color="$colorPress">
                {isPremium
                  ? `Premium (${tier === 'annual' ? 'Annual' : 'Monthly'})`
                  : 'Free plan \u2014 tap to upgrade'}
              </Paragraph>
            </YStack>
            <Text fontSize="$4" color="$colorSubtle">
              {'\u203A'}
            </Text>
          </XStack>
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
              <Text fontSize={16}>{'\u{1F6AA}'}</Text>
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
