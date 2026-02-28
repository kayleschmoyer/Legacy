import React, { useState } from 'react';
import {
  H1,
  Paragraph,
  Separator,
  useAuth,
  XStack,
  YStack,
} from '@legacy-sports/shared-components';
import { ScrollView, styled } from 'tamagui';
import { PageMeta } from '../../components/PageMeta';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  withAlpha,
} from '../../constants/colors';

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
  borderColor: BRAND_NAVY_LIGHT,
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
        backgroundColor: withAlpha(BRAND_SEAM_RED, 0.15),
        borderColor: withAlpha(BRAND_SEAM_RED, 0.4),
      },
      user: {
        backgroundColor: withAlpha(BRAND_NAVY_LIGHT, 0.15),
        borderColor: withAlpha(BRAND_NAVY_LIGHT, 0.4),
      },
      none: {
        backgroundColor: withAlpha(BG_DARK, 0.4),
        borderColor: '$glassBorder',
      },
    },
  } as const,
  defaultVariants: {
    level: 'user',
  },
});

const InfoBanner = styled(XStack, {
  alignItems: 'flex-start',
  gap: '$3',
  padding: '$4',
  borderRadius: '$5',
  borderWidth: 1,
  borderColor: withAlpha(BRAND_NAVY_LIGHT, 0.35),
  backgroundColor: withAlpha(BRAND_NAVY, 0.12),
});

/* ─── Page Background ─── */

const pageBackgroundStyle: React.CSSProperties = {
  background: `
    radial-gradient(ellipse at 15% 0%, ${withAlpha(BRAND_NAVY, 0.16)} 0%, transparent 50%),
    radial-gradient(ellipse at 85% 5%, ${withAlpha(BRAND_GOLD, 0.06)} 0%, transparent 45%)
  `,
  backgroundAttachment: 'fixed',
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
      return BRAND_SEAM_RED;
    case 'user':
      return BRAND_GOLD_LIGHT;
    default:
      return '$colorPress';
  }
}

/* ─── Main Component ─── */

const ProfileSettingsPage: React.FC = () => {
  const auth = useAuth();
  const user = auth?.user;
  const [imageError, setImageError] = useState(false);

  const userName = user?.username ?? '';
  const userEmail = user?.email ?? '';
  const userImage = user?.picture ?? null;
  const accessLevel = user?.accessLevel ?? 'none';

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
                color: BRAND_GOLD_LIGHT,
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
          <SectionCard
            style={{
              background: `linear-gradient(135deg, ${withAlpha(BG_DARK, 0.85)} 0%, ${withAlpha(BRAND_NAVY, 0.25)} 100%)`,
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
            }}
          >
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
                      'linear-gradient(135deg, #1B3A5C 0%, #2C4A7C 100%)',
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
                        lineHeight: 1,
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
                      color: BRAND_GOLD_LIGHT,
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
                  <FieldLabel>Username</FieldLabel>
                  <FieldValue>{userName}</FieldValue>
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
                  Profile details are managed through your Google account. To
                  update your name or profile photo, visit your Google Account
                  settings.
                </Paragraph>
              </InfoBanner>
            </SectionBody>
          </SectionCard>

          {/* ── Account Security ── */}
          <SectionCard
            style={{
              background: `linear-gradient(135deg, ${withAlpha(BG_DARK, 0.85)} 0%, ${withAlpha(BRAND_NAVY, 0.2)} 100%)`,
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
            }}
          >
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
                      style={{ backgroundColor: '#22c55e' }}
                    />
                    <FieldValue>Active</FieldValue>
                  </XStack>
                </FieldRow>
              </YStack>
            </SectionBody>
          </SectionCard>

          {/* ── Danger Zone ── */}
          <SectionCard
            style={{
              background: `linear-gradient(135deg, ${withAlpha(BG_DARK, 0.85)} 0%, ${withAlpha(BRAND_SEAM_RED, 0.06)} 100%)`,
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              borderColor: withAlpha(BRAND_SEAM_RED, 0.25),
            }}
          >
            <SectionHeader
              style={{ borderBottomColor: withAlpha(BRAND_SEAM_RED, 0.2) }}
            >
              <SectionIconBox
                style={{ backgroundColor: withAlpha(BRAND_SEAM_RED, 0.12) }}
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
                  style={{ color: BRAND_SEAM_RED }}
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
                  onPress={() => {
                    void auth.logout?.();
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
  backgroundColor: BRAND_SEAM_RED,
  hoverStyle: {
    opacity: 0.85,
  },
  pressStyle: {
    scale: 0.97,
    opacity: 0.9,
  },
  animation: 'quick',
});

export default ProfileSettingsPage;
