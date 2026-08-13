import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  H1,
  Paragraph,
  Separator,
  XStack,
  YStack,
} from '@legacy-sports/shared-components/ui';
import {
  AuthService,
  useAuth,
  useMfa,
} from '@legacy-sports/shared-components/auth';
import { BrandIcon } from '@legacy-sports/shared-components/icons';
import { Input, ScrollView, Spinner, styled } from 'tamagui';
import { Monitor } from '@tamagui/lucide-icons/icons/Monitor';
import { Moon } from '@tamagui/lucide-icons/icons/Moon';
import { Sun } from '@tamagui/lucide-icons/icons/Sun';
import {
  useGetUserByIdQuery,
  useMyIdentitiesQuery,
  useSetCanonicalEmailMutation,
  useUpdateUserAvatarMutation,
  useUpdateUsernameMutation,
} from '@legacy-sports/graphql';
import TwoFactorSection from '../../components/profile/TwoFactorSection';
import { PageMeta } from '../../components/PageMeta';
import { AvatarPicker } from '../../components/common';
import {
  type ThemePreference,
  useThemeContext,
} from '../../context/ThemeContext';

/* ─── Styled Components ─── */

const PageContainer = styled(YStack, {
  flex: 1,
  minHeight: '100vh',
  backgroundColor: '$background',
  paddingBottom: '$10',
});

const ContentContainer = styled(YStack, {
  maxWidth: 800,
  width: '100%',
  alignSelf: 'center',
  paddingHorizontal: '$5',
  gap: '$6',
  $sm: {
    paddingHorizontal: '$3',
    gap: '$4',
  },
});

const PageHeader = styled(YStack, {
  paddingVertical: '$8',
  gap: '$2',
  $sm: {
    paddingVertical: '$6',
  },
});

const SectionCard = styled(YStack, {
  borderRadius: '$6',
  borderWidth: 1,
  borderColor: '$glassBorder',
  overflow: 'hidden',
});

const SectionHeader = styled(XStack, {
  paddingHorizontal: '$5',
  paddingVertical: '$4',
  alignItems: 'center',
  gap: '$3',
  borderBottomWidth: 1,
  borderBottomColor: '$glassBorder',
});

const SectionIconBox = styled(YStack, {
  width: 36,
  height: 36,
  borderRadius: '$4',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '$color2',
});

const SectionBody = styled(YStack, {
  padding: '$5',
  gap: '$4',
  $sm: {
    padding: '$4',
  },
});

const FieldRow = styled(XStack, {
  alignItems: 'center',
  gap: '$4',
  $sm: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '$2',
  },
});

const FieldLabel = styled(Paragraph, {
  size: '$3',
  color: '$colorPress',
  fontWeight: '500',
  width: 140,
  flexShrink: 0,
  $sm: {
    width: 'auto',
  },
});

const FieldValue = styled(Paragraph, {
  size: '$4',
  color: '$color',
  fontWeight: '400',
  flex: 1,
});

const AvatarCircle = styled(YStack, {
  width: 80,
  height: 80,
  borderRadius: '$12',
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 3,
  borderColor: '$brandNavyLight',
  flexShrink: 0,
});

const AccessLevelBadge = styled(XStack, {
  alignItems: 'center',
  paddingHorizontal: '$3',
  paddingVertical: '$1',
  borderRadius: '$10',
  borderWidth: 1,
  variants: {
    level: {
      admin: {
        backgroundColor: '$statusDangerBg',
        borderColor: '$statusDangerBorder',
      },
      user: {
        backgroundColor: '$accentMuted',
        borderColor: '$brandNavyLight',
      },
      none: {
        backgroundColor: '$statusNeutralBg',
        borderColor: '$glassBorder',
      },
    },
  } as const,
  defaultVariants: {
    level: 'user',
  },
});

const ThemeOptionButton = styled(YStack, {
  flex: 1,
  cursor: 'pointer',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '$1',
  paddingVertical: '$3',
  paddingHorizontal: '$2',
  borderRadius: '$4',
  borderWidth: 1,
  borderColor: '$glassBorder',
  backgroundColor: '$color2',
  hoverStyle: { backgroundColor: '$color3' },
  pressStyle: { scale: 0.97 },
  animation: 'quick',
  variants: {
    active: {
      true: {
        backgroundColor: '$accentMuted',
        borderColor: '$brandNavyLight',
        hoverStyle: { backgroundColor: '$surfaceInteractive' },
      },
    },
  } as const,
});

const THEME_OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  Icon: typeof Sun;
}> = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'dark', label: 'Dark', Icon: Moon },
];

const InfoBanner = styled(XStack, {
  alignItems: 'flex-start',
  gap: '$3',
  padding: '$4',
  borderRadius: '$5',
  borderWidth: 1,
  borderColor: '$accentMuted',
  backgroundColor: '$surfaceInteractive',
});

/* ─── Page Background ─── */

const pageBackgroundStyle: React.CSSProperties = {
  background: `
    radial-gradient(ellipse at 15% 0%, color-mix(in srgb, var(--brandNavy) 16%, transparent) 0%, transparent 50%),
    radial-gradient(ellipse at 85% 5%, color-mix(in srgb, var(--brandGold) 6%, transparent) 0%, transparent 45%)
  `,
  backgroundAttachment: 'fixed',
};

const sectionCardGradientStyle: React.CSSProperties = {
  // --cardGradientEnd resolves to opaque navy in dark theme (unchanged) and
  // a soft navy tint in light theme, so the card never spans a full
  // white-to-black-navy range that fixed-color text can't stay readable
  // across (LS-9134).
  background: `linear-gradient(135deg, var(--surfaceCard) 0%, var(--cardGradientEnd) 100%)`,
};

/* ─── Helpers ─── */

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

function getAccessBadgeColor(level: string): string {
  switch (level) {
    case 'admin':
      return 'var(--brandSeamRed)';
    case 'user':
      return 'var(--brandGoldLight)';
    default:
      return 'var(--colorPress)';
  }
}

/* ─── Main Component ─── */

const ProfileSettingsPage: React.FC = () => {
  const auth = useAuth();
  const user = auth?.user;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const authService = useMemo(
    () => new AuthService(auth.config),
    [auth.config],
  );
  const [imageError, setImageError] = useState(false);
  const { themePreference, setThemePreference } = useThemeContext();
  const themeOptionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const userName = user?.username ?? '';
  const userImage = user?.picture ?? null;
  const accessLevel = user?.accessLevel ?? 'none';

  const mfa = useMfa(authService);

  const { data: userData, refetch: refetchUser } = useGetUserByIdQuery({
    variables: { id: user?.id ?? 0 },
    skip: !user?.id,
  });
  const userEmail = userData?.user?.email ?? user?.email ?? '';
  const {
    data: identitiesData,
    loading: identitiesLoading,
    refetch: refetchIdentities,
  } = useMyIdentitiesQuery({ skip: !user?.id });
  const [updateUserAvatar, { loading: avatarLoading }] =
    useUpdateUserAvatarMutation();
  const [updateUsername, { loading: usernameLoading }] =
    useUpdateUsernameMutation();
  const [setCanonicalEmail, { loading: canonicalEmailLoading }] =
    useSetCanonicalEmailMutation();

  const currentAvatarUrl = userData?.user?.avatarUrl ?? null;
  const dbUsername = userData?.user?.username ?? userName;
  // The DB user record is the source of truth for the canonical email — the
  // JWT email never changes within a session, so it would pin the "Primary
  // email" badge to the login-time identity even after setCanonicalEmail.
  const canonicalEmail = userData?.user?.email ?? userEmail;
  // A partial/errored MyIdentities response yields data without the field;
  // guard so the page renders the empty state instead of crashing.
  const identities = identitiesData?.myIdentities ?? [];

  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [discordError, setDiscordError] = useState<string | null>(null);
  const [editedUsername, setEditedUsername] = useState(dbUsername);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [canonicalEmailError, setCanonicalEmailError] = useState<string | null>(
    null,
  );
  const [unlinkLoadingProvider, setUnlinkLoadingProvider] = useState<
    string | null
  >(null);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEditingUsername) {
      setEditedUsername(dbUsername);
    }
  }, [dbUsername, isEditingUsername]);

  useEffect(() => {
    if (searchParams.get('discord_linked') === '1') {
      void refetchUser();
      void refetchIdentities();
      // Strip the param from the URL without pushing a new history entry
      const next = new URLSearchParams(searchParams);
      next.delete('discord_linked');
      navigate({ search: next.toString() }, { replace: true });
    }
  }, [searchParams, navigate, refetchUser, refetchIdentities]);

  const handleAvatarSelect = (url: string | null) => {
    void updateUserAvatar({
      variables: { avatarUrl: url },
      onCompleted: () => void refetchUser(),
    });
  };

  const handleUsernameEdit = useCallback(() => {
    setIsEditingUsername(true);
    setUsernameError(null);
  }, []);

  const handleUsernameCancel = useCallback(() => {
    setIsEditingUsername(false);
    setEditedUsername(dbUsername);
    setUsernameError(null);
  }, [dbUsername]);

  const handleUsernameSave = useCallback(() => {
    const trimmed = editedUsername.trim();
    if (trimmed.length < 3 || trimmed.length > 50) {
      setUsernameError('Username must be between 3 and 50 characters');
      return;
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(trimmed)) {
      setUsernameError(
        'Only letters, numbers, underscores, hyphens, and periods allowed',
      );
      return;
    }
    if (trimmed === dbUsername) {
      setEditedUsername(dbUsername);
      setUsernameError(null);
      setIsEditingUsername(false);
      return;
    }
    setUsernameError(null);
    void updateUsername({
      variables: { username: trimmed },
      onCompleted: () => {
        auth.updateUserProfile({ username: trimmed });
        setIsEditingUsername((editing) => {
          if (editing) void refetchUser();
          return false;
        });
      },
      onError: (err) => {
        setIsEditingUsername((editing) => {
          if (editing) setUsernameError(err.message);
          return editing;
        });
      },
    });
  }, [editedUsername, dbUsername, updateUsername, refetchUser, auth]);

  const handleConnectDiscord = useCallback(() => {
    // Delegate state generation and cookie binding to the backend
    // `/oauth/discord/authorize` endpoint. The backend issues an HttpOnly
    // single-use state cookie, then 302s the browser to Discord. The
    // CSRF binding lives entirely server-side; no sessionStorage is
    // needed (and HttpOnly is stronger against XSS than sessionStorage).
    const oauthProxyUrl = auth.config.oauthProxyUrl;
    if (!oauthProxyUrl) {
      setDiscordError('Unable to start Discord connection. Please try again.');
      return;
    }
    window.location.href = `${oauthProxyUrl}/discord/authorize?link=1`;
  }, [auth.config.oauthProxyUrl]);

  const handleSetCanonicalEmail = useCallback(
    async (identityId: number) => {
      setCanonicalEmailError(null);
      try {
        await setCanonicalEmail({
          variables: { identityId },
          onCompleted: () => {
            void refetchUser();
          },
        });
      } catch (err) {
        setCanonicalEmailError(
          err instanceof Error ? err.message : 'Failed to update email',
        );
      }
    },
    [setCanonicalEmail, refetchUser],
  );

  const handleUnlinkProvider = useCallback(
    async (provider: 'discord' | 'google' | 'apple') => {
      if (
        !window.confirm(
          `Are you sure you want to disconnect your ${provider.charAt(0).toUpperCase() + provider.slice(1)} account?`,
        )
      )
        return;
      setUnlinkLoadingProvider(provider);
      setUnlinkError(null);
      try {
        await authService.unlinkProvider(provider);
        await Promise.all([refetchUser(), refetchIdentities()]);
      } catch (err) {
        setUnlinkError(
          err instanceof Error
            ? err.message
            : `Failed to disconnect ${provider}`,
        );
      } finally {
        setUnlinkLoadingProvider(null);
      }
    },
    [authService, refetchUser, refetchIdentities],
  );

  if (!user) {
    return null;
  }

  return (
    <PageContainer style={pageBackgroundStyle}>
      <PageMeta
        title="Profile Settings"
        description="Manage your Legacy Sports profile, account details, and connected services."
      />
      <ScrollView>
        <ContentContainer>
          {/* ── Page Header ── */}
          <PageHeader>
            <H1
              style={{
                fontSize: 32,
                fontWeight: '700',
                color: 'var(--brandGoldLight)',
                letterSpacing: -0.5,
              }}
            >
              Profile Settings
            </H1>
            <Paragraph size="$4" color="$colorPress">
              Manage your account information and preferences.
            </Paragraph>
          </PageHeader>

          {/* ── Profile Card ── */}
          <SectionCard style={sectionCardGradientStyle}>
            <SectionHeader>
              <SectionIconBox>
                <Paragraph fontSize={16} lineHeight={18}>
                  <span role="img" aria-label="profile">
                    👤
                  </span>
                </Paragraph>
              </SectionIconBox>
              <YStack flex={1}>
                <Paragraph size="$4" color="$color" fontWeight="600">
                  Profile
                </Paragraph>
                <Paragraph size="$2" color="$colorPress">
                  Your public identity on Legacy Sports
                </Paragraph>
              </YStack>
            </SectionHeader>

            <SectionBody>
              {/* Avatar + Name Summary */}
              <XStack
                gap="$5"
                alignItems="center"
                $sm={{ flexDirection: 'column', alignItems: 'flex-start' }}
              >
                <AvatarCircle
                  style={{
                    background:
                      'linear-gradient(135deg, var(--brandNavy) 0%, var(--brandNavyLight) 100%)',
                  }}
                >
                  {userImage && !imageError ? (
                    <img
                      src={userImage}
                      alt={userName}
                      referrerPolicy="no-referrer"
                      crossOrigin="anonymous"
                      style={{
                        width: '100%',
                        height: '100%',
                        borderRadius: '50%',
                        objectFit: 'cover',
                      }}
                      onError={() => setImageError(true)}
                      onLoad={() => setImageError(false)}
                    />
                  ) : (
                    <Paragraph
                      style={{
                        fontSize: 32,
                        fontWeight: '700',
                        color: 'white',
                        lineHeight: '1' as unknown as number,
                      }}
                    >
                      {userName.charAt(0).toUpperCase()}
                    </Paragraph>
                  )}
                </AvatarCircle>

                <YStack gap="$2" flex={1}>
                  <Paragraph
                    style={{
                      fontSize: 22,
                      fontWeight: '700',
                      color: 'var(--brandGoldLight)',
                    }}
                  >
                    {userName}
                  </Paragraph>
                  <Paragraph size="$3" color="$colorPress">
                    {userEmail}
                  </Paragraph>
                  <AccessLevelBadge level={accessLevel}>
                    <Paragraph
                      size="$2"
                      fontWeight="600"
                      style={{ color: getAccessBadgeColor(accessLevel) }}
                    >
                      {getAccessLevelLabel(accessLevel)}
                    </Paragraph>
                  </AccessLevelBadge>
                </YStack>
              </XStack>

              <Separator />

              {/* Fields */}
              <YStack gap="$3">
                <FieldRow>
                  <FieldLabel id="profile-username-label">Username</FieldLabel>
                  {isEditingUsername ? (
                    <YStack flex={1} gap="$2">
                      <XStack gap="$2" alignItems="center" flex={1}>
                        <Input
                          id="profile-username-input"
                          aria-labelledby="profile-username-label"
                          aria-label="Username"
                          value={editedUsername}
                          onChangeText={setEditedUsername}
                          maxLength={50}
                          autoFocus
                          flex={1}
                          size="$4"
                          aria-invalid={usernameError ? 'true' : 'false'}
                          borderColor={
                            usernameError ? '$brandSeamRed' : '$glassBorder'
                          }
                          onKeyPress={(e: { nativeEvent: { key: string } }) => {
                            if (e.nativeEvent.key === 'Enter')
                              handleUsernameSave();
                            if (e.nativeEvent.key === 'Escape')
                              handleUsernameCancel();
                          }}
                        />
                        <EditButton
                          onPress={handleUsernameSave}
                          disabled={usernameLoading}
                          opacity={usernameLoading ? 0.6 : 1}
                        >
                          <Paragraph size="$2" fontWeight="600" color="white">
                            {usernameLoading ? '...' : 'Save'}
                          </Paragraph>
                        </EditButton>
                        <EditButton
                          onPress={handleUsernameCancel}
                          disabled={usernameLoading}
                          opacity={usernameLoading ? 0.6 : 1}
                          backgroundColor="$surfaceSubtle"
                        >
                          <Paragraph
                            size="$2"
                            fontWeight="600"
                            color="$colorPress"
                          >
                            Cancel
                          </Paragraph>
                        </EditButton>
                      </XStack>
                      {usernameError && (
                        <Paragraph
                          size="$2"
                          style={{ color: 'var(--brandSeamRed)' }}
                        >
                          {usernameError}
                        </Paragraph>
                      )}
                    </YStack>
                  ) : (
                    <XStack flex={1} alignItems="center" gap="$3">
                      <FieldValue>{dbUsername}</FieldValue>
                      <EditButton onPress={handleUsernameEdit}>
                        <Paragraph size="$2" fontWeight="600" color="white">
                          Edit
                        </Paragraph>
                      </EditButton>
                    </XStack>
                  )}
                </FieldRow>
                <FieldRow>
                  <FieldLabel>Email</FieldLabel>
                  <FieldValue>{userEmail}</FieldValue>
                </FieldRow>
                <FieldRow>
                  <FieldLabel>Access Level</FieldLabel>
                  <FieldValue>{getAccessLevelLabel(accessLevel)}</FieldValue>
                </FieldRow>
                <FieldRow>
                  <FieldLabel>User ID</FieldLabel>
                  <FieldValue color="$colorPress">#{user.id}</FieldValue>
                </FieldRow>
              </YStack>

              {/* Read-only notice */}
              <InfoBanner>
                <Paragraph
                  fontSize={16}
                  lineHeight={18}
                  style={{ flexShrink: 0 }}
                >
                  <span role="img" aria-label="info">
                    ℹ️
                  </span>
                </Paragraph>
                <Paragraph size="$3" color="$colorPress" flex={1}>
                  You can change your username above. Email and profile photo
                  are managed through your Google account.
                  {auth.config.discordClientId
                    ? ' Link Discord in the Connected Accounts section below for an additional sign-in option.'
                    : null}
                </Paragraph>
              </InfoBanner>
            </SectionBody>
          </SectionCard>

          {/* ── App Avatar ── */}
          <SectionCard style={sectionCardGradientStyle}>
            <SectionHeader>
              <SectionIconBox>
                <Paragraph fontSize={16} lineHeight={18}>
                  <span role="img" aria-label="avatar">
                    🏅
                  </span>
                </Paragraph>
              </SectionIconBox>
              <YStack flex={1}>
                <Paragraph size="$4" color="$color" fontWeight="600">
                  App Avatar
                </Paragraph>
                <Paragraph size="$2" color="$colorPress">
                  Choose a custom avatar displayed in chat and league views
                </Paragraph>
              </YStack>
            </SectionHeader>
            <SectionBody>
              <AvatarPicker
                variant="user"
                currentUrl={currentAvatarUrl}
                username={userName}
                onSelect={handleAvatarSelect}
                loading={avatarLoading}
              />
            </SectionBody>
          </SectionCard>

          {/* ── Appearance ── */}
          <SectionCard
            data-testid="profile-appearance-section"
            style={sectionCardGradientStyle}
          >
            <SectionHeader>
              <SectionIconBox>
                <Paragraph fontSize={16} lineHeight={18}>
                  <span role="img" aria-label="appearance">
                    🎨
                  </span>
                </Paragraph>
              </SectionIconBox>
              <YStack flex={1}>
                <Paragraph size="$4" color="$color" fontWeight="600">
                  Appearance
                </Paragraph>
                <Paragraph size="$2" color="$colorPress">
                  Choose how Legacy Sports looks on this device
                </Paragraph>
              </YStack>
            </SectionHeader>

            <SectionBody>
              <YStack gap="$3" role="radiogroup" aria-label="Theme">
                <Paragraph size="$3" color="$colorPress" fontWeight="500">
                  Theme
                </Paragraph>
                <XStack gap="$3" $sm={{ gap: '$2' }}>
                  {THEME_OPTIONS.map(({ value, label, Icon }, index) => {
                    const isActive = themePreference === value;
                    // ARIA radiogroup roving tabindex: only the checked radio
                    // is in the tab order; arrow keys move between options
                    // and update selection. If no option is checked
                    // (unlikely — theme always has a value), the first
                    // option is the tab stop so the group is reachable.
                    const activeIndex = THEME_OPTIONS.findIndex(
                      (o) => o.value === themePreference,
                    );
                    const isTabStop =
                      activeIndex === -1 ? index === 0 : isActive;
                    return (
                      <ThemeOptionButton
                        key={value}
                        ref={(el: HTMLDivElement | null) => {
                          themeOptionRefs.current[index] = el;
                        }}
                        active={isActive}
                        role="radio"
                        tabIndex={isTabStop ? 0 : -1}
                        aria-checked={isActive}
                        aria-label={`${label} theme`}
                        data-testid={`profile-theme-${value}`}
                        onPress={() => setThemePreference(value)}
                        onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                          if (e.repeat) return;
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setThemePreference(value);
                            return;
                          }
                          let nextIndex: number | null = null;
                          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                            nextIndex = (index + 1) % THEME_OPTIONS.length;
                          } else if (
                            e.key === 'ArrowLeft' ||
                            e.key === 'ArrowUp'
                          ) {
                            nextIndex =
                              (index - 1 + THEME_OPTIONS.length) %
                              THEME_OPTIONS.length;
                          } else if (e.key === 'Home') {
                            nextIndex = 0;
                          } else if (e.key === 'End') {
                            nextIndex = THEME_OPTIONS.length - 1;
                          }
                          if (nextIndex !== null) {
                            e.preventDefault();
                            const nextOption = THEME_OPTIONS[nextIndex];
                            setThemePreference(nextOption.value);
                            themeOptionRefs.current[nextIndex]?.focus();
                          }
                        }}
                      >
                        <Icon
                          size={20}
                          color={isActive ? '$brandNavy' : '$colorPress'}
                        />
                        <Paragraph
                          size="$2"
                          color={isActive ? '$brandNavy' : '$colorPress'}
                          fontWeight={isActive ? '600' : '400'}
                        >
                          {label}
                        </Paragraph>
                      </ThemeOptionButton>
                    );
                  })}
                </XStack>
              </YStack>
            </SectionBody>
          </SectionCard>

          {/* ── Account Security ── */}
          <SectionCard style={sectionCardGradientStyle}>
            <SectionHeader>
              <SectionIconBox>
                <Paragraph fontSize={16} lineHeight={18}>
                  <span role="img" aria-label="security">
                    🔒
                  </span>
                </Paragraph>
              </SectionIconBox>
              <YStack flex={1}>
                <Paragraph size="$4" color="$color" fontWeight="600">
                  Account &amp; Security
                </Paragraph>
                <Paragraph size="$2" color="$colorPress">
                  Authentication method and session details
                </Paragraph>
              </YStack>
            </SectionHeader>

            <SectionBody>
              <YStack gap="$3">
                <FieldRow>
                  <FieldLabel>Sign-in Method</FieldLabel>
                  <XStack alignItems="center" gap="$2">
                    <Paragraph fontSize={16} lineHeight={18}>
                      <span role="img" aria-label="Google">
                        🌐
                      </span>
                    </Paragraph>
                    <FieldValue>Google OAuth</FieldValue>
                  </XStack>
                </FieldRow>
                <FieldRow>
                  <FieldLabel>Session</FieldLabel>
                  <XStack alignItems="center" gap="$2">
                    <YStack
                      width={8}
                      height={8}
                      borderRadius={4}
                      backgroundColor="$statusSuccessFg"
                    />
                    <FieldValue>Active</FieldValue>
                  </XStack>
                </FieldRow>
              </YStack>
            </SectionBody>
          </SectionCard>

          {/* ── Two-Factor Authentication ── */}
          <SectionCard
            data-testid="profile-2fa-section"
            style={sectionCardGradientStyle}
          >
            <SectionHeader>
              <SectionIconBox>
                <Paragraph fontSize={16} lineHeight={18}>
                  <span role="img" aria-label="two-factor authentication">
                    🛡️
                  </span>
                </Paragraph>
              </SectionIconBox>
              <YStack flex={1}>
                <Paragraph size="$4" color="$color" fontWeight="600">
                  Two-Factor Authentication
                </Paragraph>
                <Paragraph size="$2" color="$colorPress">
                  Add an extra layer of security to your account
                </Paragraph>
              </YStack>
            </SectionHeader>

            <SectionBody>
              <TwoFactorSection mfa={mfa} />
            </SectionBody>
          </SectionCard>

          {/* ── Linked Identities ── */}
          <SectionCard
            data-testid="profile-linked-identities-section"
            style={sectionCardGradientStyle}
          >
            <SectionHeader>
              <SectionIconBox>
                <Paragraph fontSize={16} lineHeight={18}>
                  <span role="img" aria-label="linked accounts">
                    🔗
                  </span>
                </Paragraph>
              </SectionIconBox>
              <YStack flex={1}>
                <Paragraph size="$4" color="$color" fontWeight="600">
                  Linked Identities
                </Paragraph>
                <Paragraph size="$2" color="$colorPress">
                  Manage your connected sign-in providers and canonical email
                </Paragraph>
              </YStack>
            </SectionHeader>

            <SectionBody>
              {identitiesLoading ? (
                <XStack
                  justifyContent="center"
                  paddingVertical="$4"
                  alignItems="center"
                  gap="$2"
                >
                  <Spinner size="small" color="$colorPress" />
                  <Paragraph size="$3" color="$colorPress">
                    Loading…
                  </Paragraph>
                </XStack>
              ) : identities.length === 0 ? (
                <Paragraph size="$3" color="$colorPress">
                  No linked providers found.
                </Paragraph>
              ) : (
                <YStack gap="$3">
                  {identities.map((identity) => {
                    const isCanonical =
                      identity.providerEmail !== null &&
                      identity.providerEmail === canonicalEmail;
                    const canSetCanonical =
                      identity.providerEmailVerified &&
                      identity.providerEmail !== null &&
                      !isCanonical;
                    const providerLabel =
                      identity.provider.charAt(0).toUpperCase() +
                      identity.provider.slice(1);
                    const isUnlinkLoading =
                      unlinkLoadingProvider === identity.provider;

                    return (
                      <XStack
                        key={identity.id}
                        alignItems="center"
                        justifyContent="space-between"
                        gap="$4"
                        paddingVertical="$2"
                        $sm={{
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                        }}
                      >
                        <XStack alignItems="center" gap="$3" flex={1}>
                          {identity.provider === 'discord' ? (
                            <BrandIcon name="discord" size={24} />
                          ) : (
                            <Paragraph fontSize={22} lineHeight={24}>
                              {identity.provider === 'google'
                                ? '🌐'
                                : identity.provider === 'apple'
                                  ? '🍎'
                                  : '🔑'}
                            </Paragraph>
                          )}
                          <YStack gap="$0.5">
                            <XStack alignItems="center" gap="$2">
                              <Paragraph
                                size="$4"
                                color="$color"
                                fontWeight="500"
                              >
                                {providerLabel}
                              </Paragraph>
                              {isCanonical ? (
                                <XStack
                                  paddingHorizontal="$2"
                                  paddingVertical="$0.5"
                                  borderRadius="$10"
                                  style={{
                                    backgroundColor:
                                      'color-mix(in srgb, var(--brandGold) 18%, transparent)',
                                    borderWidth: 1,
                                    borderColor:
                                      'color-mix(in srgb, var(--brandGold) 45%, transparent)',
                                  }}
                                >
                                  <Paragraph
                                    size="$1"
                                    fontWeight="600"
                                    style={{ color: 'var(--brandGoldLight)' }}
                                  >
                                    Primary email
                                  </Paragraph>
                                </XStack>
                              ) : null}
                            </XStack>
                            <Paragraph size="$3" color="$colorPress">
                              {identity.providerEmail ?? 'No email'}
                              {identity.providerEmail &&
                              !identity.providerEmailVerified
                                ? ' (unverified)'
                                : null}
                            </Paragraph>
                          </YStack>
                        </XStack>

                        <XStack gap="$2" alignItems="center">
                          {canSetCanonical ? (
                            <EditButton
                              onPress={() =>
                                void handleSetCanonicalEmail(identity.id)
                              }
                              disabled={canonicalEmailLoading}
                              opacity={canonicalEmailLoading ? 0.6 : 1}
                              data-testid={`set-canonical-email-${identity.id}`}
                            >
                              <Paragraph
                                size="$2"
                                fontWeight="600"
                                color="white"
                              >
                                {canonicalEmailLoading ? '…' : 'Set as primary'}
                              </Paragraph>
                            </EditButton>
                          ) : null}
                          {identity.provider !== 'local' ? (
                            <EditButton
                              onPress={() =>
                                void handleUnlinkProvider(
                                  identity.provider as
                                    | 'discord'
                                    | 'google'
                                    | 'apple',
                                )
                              }
                              disabled={isUnlinkLoading}
                              opacity={isUnlinkLoading ? 0.6 : 1}
                              backgroundColor="$brandSeamRed"
                              data-testid={`unlink-provider-${identity.provider}`}
                            >
                              {isUnlinkLoading ? (
                                <Spinner size="small" color="white" />
                              ) : (
                                <Paragraph
                                  size="$2"
                                  fontWeight="600"
                                  color="white"
                                >
                                  Disconnect
                                </Paragraph>
                              )}
                            </EditButton>
                          ) : null}
                        </XStack>
                      </XStack>
                    );
                  })}
                </YStack>
              )}

              {canonicalEmailError ? (
                <Paragraph size="$2" style={{ color: 'var(--brandSeamRed)' }}>
                  {canonicalEmailError}
                </Paragraph>
              ) : null}
              {unlinkError ? (
                <Paragraph size="$2" style={{ color: 'var(--brandSeamRed)' }}>
                  {unlinkError}
                </Paragraph>
              ) : null}

              {/* Legacy Discord connect button when no identities loaded yet */}
              {auth.config.discordClientId &&
              !identities.some((i) => i.provider === 'discord') ? (
                <YStack
                  gap="$3"
                  paddingTop={identities.length > 0 ? '$3' : '$0'}
                >
                  {identities.length > 0 ? <Separator /> : null}
                  <XStack
                    alignItems="center"
                    justifyContent="space-between"
                    gap="$4"
                    $sm={{
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                    }}
                  >
                    <XStack alignItems="center" gap="$3" flex={1}>
                      <BrandIcon name="discord" size={24} />
                      <YStack gap="$0.5">
                        <Paragraph size="$4" color="$color" fontWeight="500">
                          Discord
                        </Paragraph>
                        <Paragraph size="$3" color="$colorPress">
                          Not connected
                        </Paragraph>
                      </YStack>
                    </XStack>
                    <EditButton
                      onPress={handleConnectDiscord}
                      backgroundColor="$discordBlurple"
                    >
                      <Paragraph size="$2" fontWeight="600" color="white">
                        Connect Discord
                      </Paragraph>
                    </EditButton>
                  </XStack>
                  {discordError ? (
                    <Paragraph
                      size="$2"
                      style={{ color: 'var(--brandSeamRed)' }}
                    >
                      {discordError}
                    </Paragraph>
                  ) : null}
                </YStack>
              ) : null}
            </SectionBody>
          </SectionCard>

          {/* ── Danger Zone ── */}
          <SectionCard
            style={{
              background:
                'linear-gradient(135deg, var(--surfaceCard) 0%, color-mix(in srgb, var(--brandSeamRed) 12%, transparent) 100%)',
              borderColor:
                'color-mix(in srgb, var(--brandSeamRed) 25%, transparent)',
            }}
          >
            <SectionHeader
              style={{
                borderBottomColor:
                  'color-mix(in srgb, var(--brandSeamRed) 20%, transparent)',
              }}
            >
              <SectionIconBox
                style={{
                  backgroundColor:
                    'color-mix(in srgb, var(--brandSeamRed) 12%, transparent)',
                }}
              >
                <Paragraph fontSize={16} lineHeight={18}>
                  <span role="img" aria-label="sign out">
                    🚪
                  </span>
                </Paragraph>
              </SectionIconBox>
              <YStack flex={1}>
                <Paragraph
                  size="$4"
                  fontWeight="600"
                  style={{ color: 'var(--brandSeamRed)' }}
                >
                  Session
                </Paragraph>
                <Paragraph size="$2" color="$colorPress">
                  Sign out of your account
                </Paragraph>
              </YStack>
            </SectionHeader>

            <SectionBody>
              <XStack
                alignItems="center"
                justifyContent="space-between"
                gap="$4"
                $sm={{ flexDirection: 'column', alignItems: 'flex-start' }}
              >
                <YStack gap="$1" flex={1}>
                  <Paragraph size="$4" color="$color" fontWeight="500">
                    Sign out
                  </Paragraph>
                  <Paragraph size="$3" color="$colorPress">
                    You will be signed out of your Legacy Sports account and
                    redirected to the login page.
                  </Paragraph>
                </YStack>
                <SignOutButton
                  role="button"
                  tabIndex={0}
                  onPress={() => {
                    void auth.logout?.();
                  }}
                  onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                    if (e.repeat) {
                      return;
                    }
                    if (e.key === 'Enter' || e.key === ' ') {
                      if (e.key === ' ') {
                        e.preventDefault();
                      }
                      void auth.logout?.();
                    }
                  }}
                >
                  <Paragraph
                    size="$3"
                    fontWeight="600"
                    style={{ color: 'white' }}
                  >
                    Sign Out
                  </Paragraph>
                </SignOutButton>
              </XStack>
            </SectionBody>
          </SectionCard>
        </ContentContainer>
      </ScrollView>
    </PageContainer>
  );
};

const SignOutButton = styled(YStack, {
  paddingHorizontal: '$5',
  paddingVertical: '$3',
  borderRadius: '$5',
  cursor: 'pointer',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '$brandSeamRed',
  hoverStyle: {
    opacity: 0.85,
  },
  pressStyle: {
    scale: 0.97,
    opacity: 0.9,
  },
  animation: 'quick',
});

const EditButtonBase = styled(YStack, {
  paddingHorizontal: '$3',
  paddingVertical: '$1.5',
  borderRadius: '$4',
  cursor: 'pointer',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '$brandNavyLight',
  hoverStyle: {
    opacity: 0.85,
  },
  pressStyle: {
    scale: 0.97,
    opacity: 0.9,
  },
  animation: 'quick',
});

function EditButton({
  onPress,
  disabled,
  ...props
}: React.ComponentProps<typeof EditButtonBase>) {
  return (
    <EditButtonBase
      {...props}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={Boolean(disabled)}
      onPress={onPress}
      disabled={disabled}
      onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.repeat || disabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault(); // prevent native click (Enter) and scroll (Space)
          (e.currentTarget as HTMLElement).click();
        }
      }}
    />
  );
}

export default ProfileSettingsPage;
