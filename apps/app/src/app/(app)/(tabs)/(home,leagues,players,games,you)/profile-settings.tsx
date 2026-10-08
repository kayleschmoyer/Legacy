import React, { useCallback, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
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
import {
  AvatarImage,
  AvatarPicker,
  BrandIcon,
  Dialog,
  formatDisplayName,
} from '@legacy-sports/shared-components';
import { LOGGER } from '@legacy-sports/logging';
import {
  useGetUserByIdQuery,
  useMyIdentitiesQuery,
  useUpdateUserAvatarMutation,
  useUpdateUsernameMutation,
} from '@legacy-sports/graphql';
import { brand } from '@legacy-sports/design-tokens';
import { getAccessLevelLabel, validateUsername } from '@legacy-sports/utils';
import {
  unlinkDiscordAccount,
  useAuthHandlers,
  useCurrentUserInfo,
} from '../../../../common/auth/AuthHooks';
import {
  getSubscriptionWarning,
  useSubscription,
} from '../../../../features/subscription';
import { trackSignOut } from '../../../../utils/analytics';
import { useSystemBackAction } from '../../../../common/hooks/useSystemBackAction';

const TIER_LABELS: Readonly<Record<string, string>> = {
  monthly: 'Monthly',
  annual: 'Annual',
  lifetime: 'Lifetime',
};

/** Maps a subscription tier to its display label; unknown tiers surface the raw name. */
function getTierLabel(tier: string | null | undefined): string {
  if (!tier) return 'Monthly';
  return TIER_LABELS[tier] ?? tier;
}

type LinkedProvider = 'discord' | 'google' | 'apple';

const KNOWN_PROVIDERS: readonly LinkedProvider[] = [
  'discord',
  'google',
  'apple',
];

function isKnownProvider(provider: string): provider is LinkedProvider {
  return (KNOWN_PROVIDERS as readonly string[]).includes(provider);
}

function getProviderLabel(provider: string): string {
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

export default function ProfileSettingsScreen(): React.JSX.Element {
  const { data: currentUser } = useCurrentUserInfo();
  const { logout } = useAuthHandlers();
  const { isPremium, tier, subscription } = useSubscription();
  const subscriptionWarning = getSubscriptionWarning(subscription, isPremium);
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);

  // Fetch full user data (including avatarUrl)
  const userId = currentUser?.id;
  const { data: userData, refetch: refetchUser } = useGetUserByIdQuery({
    variables: { id: userId ?? 0 },
    skip: !userId,
  });
  const user = userData?.user;

  // Linked identities (read-only). A partial/errored response yields data
  // without the field, so guard with `?? []` instead of trusting the shape.
  const {
    data: identitiesData,
    loading: identitiesLoading,
    error: identitiesError,
    refetch: refetchIdentities,
  } = useMyIdentitiesQuery({ skip: !userId });
  const identities = identitiesData?.myIdentities ?? [];
  const hasDiscordIdentity = identities.some(
    (identity) => identity.provider === 'discord',
  );
  const signInMethodLabel = identitiesLoading
    ? 'Loading\u2026'
    : identities.length > 0
      ? identities
          .map((identity) => getProviderLabel(identity.provider))
          .join(', ')
      : 'Unknown';

  // Discord disconnect state (LS-10413)
  const [confirmingDiscordUnlink, setConfirmingDiscordUnlink] = useState(false);
  const [unlinkingDiscord, setUnlinkingDiscord] = useState(false);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);

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

  // logout() clears the token before it navigates away. A hardware back press
  // in that window would pop the route while auth state is half-cleared, so
  // swallow it until sign-out finishes (LS-7223).
  useSystemBackAction(loggingOut, () => undefined);

  const handleLogout = async () => {
    setConfirmingSignOut(false);
    setLoggingOut(true);
    trackSignOut('profile_settings');
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  };

  const handleDisconnectDiscord = useCallback(async () => {
    setConfirmingDiscordUnlink(false);
    setUnlinkingDiscord(true);
    setUnlinkError(null);
    try {
      await unlinkDiscordAccount();
      await Promise.all([refetchUser(), refetchIdentities()]);
    } catch (error) {
      setUnlinkError(
        error instanceof Error && error.message
          ? error.message
          : 'Failed to disconnect Discord',
      );
    } finally {
      setUnlinkingDiscord(false);
    }
  }, [refetchUser, refetchIdentities]);

  const handleStartEditUsername = useCallback(() => {
    setUsernameInput(user?.username ?? currentUser?.username ?? '');
    setUsernameError(null);
    setEditingUsername(true);
  }, [user?.username, currentUser?.username]);

  const handleSaveUsername = useCallback(async () => {
    const validation = validateUsername(usernameInput);
    if (!validation.valid) {
      setUsernameError(
        'Username must be 3-50 characters: letters, numbers, _, -, or .',
      );
      return;
    }
    try {
      await updateUsername({ variables: { username: validation.username } });
      await refetchUser();
      setEditingUsername(false);
      setUsernameError(null);
    } catch (err) {
      LOGGER.error(
        'Failed to update username:',
        err instanceof Error ? err : String(err),
      );
      setUsernameError(
        err instanceof Error && err.message
          ? err.message
          : 'Failed to update username. Please try again.',
      );
    }
  }, [usernameInput, updateUsername, refetchUser]);

  const handleAvatarSelect = useCallback(
    async (url: string | null) => {
      if (updatingAvatar) return;
      try {
        await updateAvatar({ variables: { avatarUrl: url } });
        await refetchUser();
        setShowAvatarPicker(false);
      } catch (err) {
        LOGGER.error('Failed to update avatar:', String(err));
      }
    },
    [updateAvatar, updatingAvatar, refetchUser],
  );

  // Android hardware back / edge-swipe would otherwise pop the route and
  // silently discard a dirty username edit (LS-7235). Sign-out's own back
  // swallow (above) takes precedence while it is in flight.
  const savedUsername = user?.username ?? currentUser?.username ?? '';
  useSystemBackAction(
    !loggingOut && editingUsername && usernameInput.trim() !== savedUsername,
    () => {
      Alert.alert('Discard unsaved changes?', undefined, [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            setEditingUsername(false);
            setUsernameError(null);
            router.back();
          },
        },
      ]);
    },
  );

  const userName = user?.username ?? currentUser?.username ?? '';
  const displayName = formatDisplayName(userName);
  const userEmail = user?.email ?? currentUser?.email ?? '';
  const isAdmin =
    user?.accessLevel === 'admin' || (currentUser?.isAdmin ?? false);
  const avatarUrl = user?.avatarUrl ?? null;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView keyboardShouldPersistTaps="handled">
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
                color: brand.goldLight,
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
                  accessibilityState={{ expanded: showAvatarPicker }}
                >
                  <AvatarImage
                    url={avatarUrl}
                    username={displayName}
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
                    backgroundColor={brand.navyLight}
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
                      color: brand.goldLight,
                    }}
                  >
                    {displayName}
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
                    borderColor={isAdmin ? brand.seamRed : brand.navyLight}
                    backgroundColor={
                      isAdmin ? 'rgba(196,30,58,0.1)' : 'rgba(44,74,124,0.1)'
                    }
                  >
                    <Paragraph
                      size="$2"
                      fontWeight="600"
                      color={isAdmin ? brand.seamRed : brand.goldLight}
                    >
                      {getAccessLevelLabel(isAdmin ? 'admin' : 'none')}
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
                    username={displayName}
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
                        autoComplete="username"
                        textContentType="username"
                        placeholder="username"
                      />
                      <Button
                        size="$2"
                        backgroundColor="$brandNavyLight"
                        hoverStyle={{ backgroundColor: '$brandNavy' }}
                        pressStyle={{ backgroundColor: '$brandNavyDark' }}
                        onPress={() => void handleSaveUsername()}
                        disabled={updatingUsername}
                        icon={
                          updatingUsername ? (
                            <Spinner size="small" />
                          ) : undefined
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
                        {displayName}
                      </Paragraph>
                      <Button
                        size="$2"
                        chromeless
                        color={brand.navyLight}
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
                  <Paragraph
                    size="$4"
                    color="$color"
                    testID="sign-in-method-value"
                  >
                    {signInMethodLabel}
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

          {/* Connected Accounts (read-only; Connect/Disconnect are separate tickets) */}
          <YStack
            borderRadius="$6"
            borderWidth={1}
            borderColor="$borderColor"
            overflow="hidden"
            testID="connected-accounts-card"
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
                <Text fontSize={16}>{'\u{1F517}'}</Text>
              </YStack>
              <YStack flex={1}>
                <Paragraph size="$4" color="$color" fontWeight="600">
                  Connected Accounts
                </Paragraph>
                <Paragraph size="$2" color="$colorPress">
                  Sign-in providers linked to your account
                </Paragraph>
              </YStack>
            </XStack>

            <YStack padding="$5" gap="$3">
              {identitiesLoading ? (
                <XStack
                  alignItems="center"
                  gap="$2"
                  testID="identities-loading"
                >
                  <Spinner size="small" />
                  <Paragraph size="$3" color="$colorPress">
                    Loading{'\u2026'}
                  </Paragraph>
                </XStack>
              ) : identitiesError && identities.length === 0 ? (
                <Paragraph size="$3" color="$red10" testID="identities-error">
                  Could not load linked accounts.
                </Paragraph>
              ) : (
                <>
                  {identities.length === 0 ? (
                    <Paragraph size="$3" color="$colorPress">
                      No linked providers found.
                    </Paragraph>
                  ) : null}
                  {identities.map((identity) => {
                    const detail =
                      identity.provider === 'discord' &&
                      identity.providerUsername
                        ? identity.providerUsername
                        : (identity.providerEmail ?? 'No email');
                    const showUnverified =
                      identity.providerEmail != null &&
                      !identity.providerEmailVerified;
                    return (
                      <XStack
                        key={identity.id}
                        alignItems="center"
                        gap="$3"
                        testID={`identity-row-${identity.provider}`}
                      >
                        {isKnownProvider(identity.provider) ? (
                          <BrandIcon name={identity.provider} size={24} />
                        ) : (
                          <Text fontSize={22}>{'\u{1F511}'}</Text>
                        )}
                        <YStack flex={1}>
                          <Paragraph size="$4" color="$color" fontWeight="500">
                            {getProviderLabel(identity.provider)}
                          </Paragraph>
                          <Paragraph size="$3" color="$colorPress">
                            {detail}
                            {showUnverified ? ' (unverified)' : ''}
                          </Paragraph>
                        </YStack>
                        {identity.provider === 'discord' ? (
                          <Button
                            size="$2"
                            chromeless
                            color={brand.seamRed}
                            onPress={() => setConfirmingDiscordUnlink(true)}
                            disabled={unlinkingDiscord}
                            icon={
                              unlinkingDiscord ? (
                                <Spinner size="small" />
                              ) : undefined
                            }
                            testID="disconnect-discord"
                          >
                            Disconnect
                          </Button>
                        ) : null}
                      </XStack>
                    );
                  })}
                  {!hasDiscordIdentity ? (
                    <XStack
                      alignItems="center"
                      gap="$3"
                      testID="identity-row-discord-not-connected"
                    >
                      <BrandIcon name="discord" size={24} />
                      <YStack flex={1}>
                        <Paragraph size="$4" color="$color" fontWeight="500">
                          Discord
                        </Paragraph>
                        <Paragraph size="$3" color="$colorPress">
                          Not connected
                        </Paragraph>
                      </YStack>
                    </XStack>
                  ) : null}
                </>
              )}
              {unlinkError ? (
                <Paragraph size="$3" color="$red10" testID="unlink-error">
                  {unlinkError}
                </Paragraph>
              ) : null}
            </YStack>
            <Dialog
              open={confirmingDiscordUnlink}
              onOpenChange={setConfirmingDiscordUnlink}
              eyebrow="Connected accounts"
              title="Disconnect Discord?"
              description="You will no longer be able to sign in with Discord. You can reconnect it at any time."
              confirmLabel="Disconnect"
              cancelLabel="Keep connected"
              destructive
              onCancel={() => setConfirmingDiscordUnlink(false)}
              onConfirm={() => void handleDisconnectDiscord()}
            />
          </YStack>

          {/* Subscription & Billing */}
          <YStack
            borderRadius="$6"
            borderWidth={1}
            borderColor={isPremium ? `${brand.goldLight}4D` : '$borderColor'}
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
              accessibilityLabel={
                subscriptionWarning
                  ? `Subscription and billing settings. ${subscriptionWarning.message}`
                  : 'Subscription and billing settings'
              }
            >
              <YStack
                width={36}
                height={36}
                borderRadius="$4"
                alignItems="center"
                justifyContent="center"
                backgroundColor={isPremium ? `${brand.goldLight}33` : '$color2'}
              >
                <Text fontSize={16}>{isPremium ? '\u2B50' : '\u{1F48E}'}</Text>
              </YStack>
              <YStack flex={1}>
                <Paragraph size="$4" color="$color" fontWeight="600">
                  Subscription & Billing
                </Paragraph>
                <Paragraph size="$2" color="$colorPress">
                  {isPremium
                    ? `Premium (${getTierLabel(tier)})`
                    : 'Free plan \u2014 tap to upgrade'}
                </Paragraph>
                {subscriptionWarning ? (
                  <XStack
                    alignSelf="flex-start"
                    alignItems="center"
                    gap="$1.5"
                    marginTop="$1.5"
                    paddingHorizontal="$2"
                    paddingVertical="$1"
                    borderRadius="$10"
                    borderWidth={1}
                    borderColor={`${brand.seamRed}44`}
                    backgroundColor={`${brand.seamRed}1A`}
                    testID="subscription-warning-chip"
                  >
                    <Text fontSize={12}>{'\u26A0\uFE0F'}</Text>
                    <Paragraph size="$1" color={brand.seamRed} fontWeight="600">
                      {subscriptionWarning.message}
                    </Paragraph>
                  </XStack>
                ) : null}
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
            borderColor={`${brand.seamRed}40`}
            overflow="hidden"
          >
            <XStack
              paddingHorizontal="$5"
              paddingVertical="$4"
              alignItems="center"
              gap="$3"
              borderBottomWidth={1}
              borderBottomColor={`${brand.seamRed}30`}
            >
              <YStack
                width={36}
                height={36}
                borderRadius="$4"
                alignItems="center"
                justifyContent="center"
                backgroundColor={`${brand.seamRed}1A`}
              >
                <Text fontSize={16}>{'\u{1F6AA}'}</Text>
              </YStack>
              <YStack flex={1}>
                <Paragraph size="$4" fontWeight="600" color={brand.seamRed}>
                  Session
                </Paragraph>
                <Paragraph size="$2" color="$colorPress">
                  Sign out of your account
                </Paragraph>
              </YStack>
            </XStack>

            <YStack padding="$5" gap="$3">
              <XStack
                alignItems="center"
                justifyContent="space-between"
                gap="$4"
              >
                <YStack gap="$1" flex={1}>
                  <Paragraph size="$4" color="$color" fontWeight="500">
                    Sign out
                  </Paragraph>
                  <Paragraph size="$3" color="$colorPress">
                    You will be signed out and redirected to the login page.
                  </Paragraph>
                </YStack>
                <Button
                  backgroundColor={brand.seamRed}
                  color="white"
                  onPress={() => setConfirmingSignOut(true)}
                  disabled={loggingOut}
                  paddingHorizontal="$5"
                >
                  {loggingOut ? 'Signing out...' : 'Sign Out'}
                </Button>
                <Dialog
                  open={confirmingSignOut}
                  onOpenChange={setConfirmingSignOut}
                  eyebrow="Account"
                  title="Sign out?"
                  description="You will be signed out of this device and redirected to the login page."
                  confirmLabel="Sign out"
                  cancelLabel="Stay signed in"
                  destructive
                  onCancel={() => setConfirmingSignOut(false)}
                  onConfirm={() => void handleLogout()}
                />
              </XStack>
            </YStack>
          </YStack>
        </YStack>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
export { ScreenErrorBoundary as ErrorBoundary } from '../../_screenErrorBoundary';
