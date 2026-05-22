import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { LOGGER } from '@legacy-sports/logging';
import {
  OAuthProvider,
  XStack,
  YStack,
} from '@legacy-sports/shared-components/ui';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { ScrollView, Spinner, styled, Text, Theme } from 'tamagui';
import {
  BRAND_ICON_ACCENT,
  BrandIcon,
  type BrandIconName,
} from '../../components/icons';
import { PageMeta } from '../../components/PageMeta';
import { storeCsrfToken } from '../../lib/csrf';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_DARK,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  withAlpha,
} from '../../constants/colors';

/* ─── Styled Components ─── */

const PageContainer = styled(YStack, {
  flex: 1,
  minHeight: '100vh',
  backgroundColor: '$background',
});

const ContentContainer = styled(YStack, {
  maxWidth: 1200,
  width: '100%',
  alignSelf: 'center',
  paddingHorizontal: '$5',
  $sm: {
    paddingHorizontal: '$3',
  },
});

const HeroSection = styled(YStack, {
  position: 'relative',
  overflow: 'hidden',
  paddingVertical: '$14',
  paddingHorizontal: '$6',
  alignItems: 'center',
  gap: '$6',
  $sm: {
    paddingVertical: '$10',
    paddingHorizontal: '$4',
    gap: '$5',
  },
});

const HeroBadge = styled(XStack, {
  alignItems: 'center',
  gap: '$2',
  paddingHorizontal: '$4',
  paddingVertical: '$1.5',
  borderRadius: '$10',
  backgroundColor: '$surfaceInteractive',
  borderWidth: 1,
  borderColor: '$accentMuted',
  animation: 'medium',
  enterStyle: { opacity: 0, y: -10 },
});

const SignInButton = styled(YStack, {
  borderRadius: '$6',
  paddingVertical: '$3',
  paddingHorizontal: '$7',
  backgroundColor: BRAND_NAVY_LIGHT,
  borderColor: 'transparent',
  cursor: 'pointer',
  alignItems: 'center',
  justifyContent: 'center',
  animation: 'medium',
  hoverStyle: {
    backgroundColor: BRAND_NAVY,
    transform: 'translateY(-2px)',
  },
  pressStyle: {
    backgroundColor: BRAND_NAVY_DARK,
    scale: 0.97,
  },
  $sm: {
    paddingHorizontal: '$5',
  },
});

const OutlineSignInButton = styled(YStack, {
  borderRadius: '$6',
  paddingVertical: '$3',
  paddingHorizontal: '$6',
  backgroundColor: 'transparent',
  borderWidth: 1,
  borderColor: '$accentMuted',
  cursor: 'pointer',
  alignItems: 'center',
  justifyContent: 'center',
  animation: 'medium',
  hoverStyle: {
    backgroundColor: '$surfaceInteractive',
    borderColor: '$borderColorFocus',
  },
  pressStyle: {
    scale: 0.97,
  },
});

const FeatureIconCircle = styled(YStack, {
  width: 44,
  height: 44,
  borderRadius: 9999,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '$surfaceInteractive',
  borderWidth: 1,
  borderColor: '$accentMuted',
});

const SportCard = styled(YStack, {
  flex: 1,
  minWidth: 240,
  position: 'relative',
  overflow: 'hidden',
  borderRadius: '$7',
  borderWidth: 1,
  borderColor: '$glassBorder',
  padding: '$6',
  gap: '$4',
  animation: 'medium',
  hoverStyle: {
    borderColor: '$glassBorderHover',
    transform: 'translateY(-4px)',
  },
  $sm: {
    minWidth: '100%',
    padding: '$4',
  },
});

const FeaturedDraftCard = styled(YStack, {
  width: '100%',
  borderRadius: '$6',
  borderWidth: 1,
  borderColor: '$glassBorder',
  padding: '$7',
  gap: '$4',
  animation: 'medium',
  hoverStyle: {
    borderColor: '$glassBorderHover',
    transform: 'translateY(-2px)',
  },
  $sm: {
    padding: '$5',
  },
});

const UtilityCard = styled(YStack, {
  flex: 1,
  minWidth: 160,
  borderRadius: '$5',
  borderWidth: 1,
  borderColor: '$glassBorder',
  padding: '$4',
  gap: '$2',
  animation: 'medium',
  hoverStyle: {
    borderColor: '$glassBorderHover',
    transform: 'translateY(-2px)',
  },
  $sm: {
    minWidth: '100%',
  },
});

const StepCard = styled(YStack, {
  flex: 1,
  minWidth: 220,
  gap: '$3',
  $sm: {
    minWidth: '100%',
  },
});

/* ─── Background Styles ─── */

const pageBackgroundStyle: React.CSSProperties = {
  background: `
    radial-gradient(ellipse at 20% 0%, ${withAlpha(BRAND_NAVY, 0.22)} 0%, transparent 55%),
    radial-gradient(ellipse at 80% 10%, ${withAlpha(BRAND_SEAM_RED, 0.1)} 0%, transparent 45%),
    radial-gradient(ellipse at 50% 90%, ${withAlpha(BRAND_GOLD, 0.08)} 0%, transparent 50%)
  `,
  backgroundAttachment: 'fixed',
};

const heroGradientStyle: React.CSSProperties = {
  background: `linear-gradient(180deg, ${withAlpha(BRAND_NAVY, 0.18)} 0%, transparent 70%)`,
};

const heroHeadingStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: '"Big Shoulders Display", system-ui, sans-serif',
  fontWeight: 800,
  textAlign: 'center',
  letterSpacing: '-0.02em',
  lineHeight: 1,
  fontSize: 'clamp(2.5rem, 6vw, 4rem)',
  color: '#FFFFFF',
};

const sectionHeadingStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: '"Big Shoulders Display", sans-serif',
  fontWeight: 800,
  letterSpacing: -0.5,
  lineHeight: 1.05,
  textAlign: 'center',
  fontSize: 'clamp(1.75rem, 4vw, 2.5rem)',
};

const stepNumberStyle: React.CSSProperties = {
  fontFamily: '"Big Shoulders Display", sans-serif',
  fontWeight: 800,
  fontSize: 'clamp(3rem, 6vw, 5rem)',
  lineHeight: 1,
  color: BRAND_GOLD,
  opacity: 0.55,
  display: 'block',
};

const featureCardStyle: React.CSSProperties = {
  background: `linear-gradient(135deg, ${BG_DARK} 0%, ${BRAND_NAVY} 100%)`,
};

const sportCardStyle = (accentColor: string): React.CSSProperties => ({
  background: `linear-gradient(135deg, ${BG_DARK} 0%, ${accentColor} 100%)`,
});

/* ─── Feature & Sport Data ─── */

const FEATURES = [
  {
    icon: 'stats' as const,
    label: 'stats',
    title: 'Live Stats',
    description:
      'Player statistics and performance trends updated as the game unfolds.',
  },
  {
    icon: 'live' as const,
    label: 'realtime',
    title: 'Instant Updates',
    description:
      'Scores update live. Lineup locks notify you before the first pitch.',
  },
  {
    icon: 'secure' as const,
    label: 'secure',
    title: 'Secure Leagues',
    description:
      'Private invite codes, commissioner controls, and fair waiver rules.',
  },
];

const HOW_IT_WORKS = [
  {
    number: '01',
    title: 'Pick your era',
    description:
      'Choose from 1920s legends to modern stars — every active MLB season is in the pool.',
  },
  {
    number: '02',
    title: 'Draft your legends',
    description:
      'Snake or auction format. Real historical rosters. The 1927 Yankees lineup is available.',
  },
  {
    number: '03',
    title: 'Compete on their stats',
    description:
      'Head-to-head matchups scored on archived MLB statistics — exactly as they played.',
  },
];

const SPORTS = [
  {
    icon: 'baseball' as const,
    label: 'baseball',
    title: 'Baseball',
    description:
      'Build your roster, dominate the draft, and track real-time stats across every matchup.',
    accent: withAlpha(BRAND_NAVY, 0.55),
    available: true,
  },
] satisfies Array<{
  icon: BrandIconName;
  label: string;
  title: string;
  description: string;
  accent: string;
  available: boolean;
}>;

/* ─── Component ─── */

export function PublicLandingPage(): React.JSX.Element {
  const { config, loginWithOAuth, error: authError } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isDiscordLoading, setIsDiscordLoading] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [isConfiguring, setIsConfiguring] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  // Prefer locally-set error (from catch blocks in this component) but fall
  // back to the auth context error so that AUTH_FAILURE messages (which are
  // dispatched before this component remounts after the loading spinner)
  // are still visible to the user.
  const displayError = errorMessage || authError || '';

  // Handle Discord OAuth callback: automatically exchange the code when the
  // page loads on the /auth/discord/callback path.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.location.pathname.endsWith('/auth/discord/callback')) return;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');

    if (error) {
      setErrorMessage(`Discord sign-in was cancelled or denied.`);
      return;
    }

    if (!code || !state) {
      setErrorMessage(
        'Discord sign-in failed: invalid state. Please try again.',
      );
      return;
    }

    setIsDiscordLoading(true);
    setErrorMessage('');

    const oauthProxyUrl = config.oauthProxyUrl ?? 'http://localhost:5001';

    const exchangeCode = async () => {
      try {
        const response = await fetch(`${oauthProxyUrl}/discord`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ code, state }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          let message = `Discord sign-in failed (${response.status})`;
          try {
            const errorData = JSON.parse(errorText) as {
              message?: string;
              error?: string;
            };
            if (errorData.message ?? errorData.error) {
              message = (errorData.message ?? errorData.error) as string;
            }
          } catch {
            // keep default
          }
          throw new Error(message);
        }

        const result = (await response.json()) as {
          jwt: string;
          csrfToken?: string;
        };

        if (!result.jwt)
          throw new Error('Discord sign-in did not return a token');

        // Persist CSRF token so subsequent API requests include it.
        if (result.csrfToken) {
          storeCsrfToken(result.csrfToken);
        }

        // Decode user and expiry from the JWT so AuthProvider can restore
        // the session immediately on the next page load (no loading flash).
        try {
          const parts = result.jwt.split('.');
          if (parts.length === 3) {
            const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const paddedB64 = b64.padEnd(
              b64.length + ((4 - (b64.length % 4)) % 4),
              '=',
            );
            const payload = JSON.parse(atob(paddedB64)) as {
              id?: number;
              email?: string;
              username?: string;
              name?: string;
              picture?: string;
              accessLevel?: string;
              exp?: number;
            };
            const userProfile = {
              id: payload.id ?? 0,
              email: payload.email ?? '',
              username: payload.username ?? payload.name ?? 'Unknown',
              picture: payload.picture,
              accessLevel: payload.accessLevel ?? 'user',
            };
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem(
                'ls_user_profile',
                JSON.stringify(userProfile),
              );
              if (payload.exp) {
                localStorage.setItem('ls_token_expiry', String(payload.exp));
              }
            }
          }
        } catch (err) {
          // Best-effort — AuthProvider will restore the session from the
          // HttpOnly cookie on next load even if this decode fails.
          LOGGER.warn(
            'Failed to decode Discord JWT payload for session pre-cache',
            err instanceof Error ? err : String(err),
          );
        }

        // Navigate to home; AuthProvider will restore the session from cache
        // and the HttpOnly JWT cookie will authenticate API requests.
        window.location.replace(import.meta.env.BASE_URL || '/');
      } catch (err) {
        LOGGER.error('Discord callback exchange failed:', String(err));
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Discord sign-in failed. Please try again.',
        );
      } finally {
        setIsDiscordLoading(false);
      }
    };

    void exchangeCode();
  }, [config.oauthProxyUrl]);

  // Configure OAuth on mount.
  // One Tap is disabled here: the public landing page is only shown to
  // anonymous visitors, and initialising One Tap triggers a FedCM call that
  // logs "Not signed in with the identity provider." in the browser console for
  // users who are not signed into Google. Explicit sign-in buttons provide the
  // appropriate UX; One Tap would add no value for first-time visitors.
  useEffect(() => {
    const configure = async () => {
      try {
        await OAuthProvider.configure({
          ...config,
          gsi: { ...(config.gsi ?? {}), oneTap: false },
        });
        setIsConfigured(true);
      } catch (error) {
        LOGGER.error(
          'Failed to configure OAuth on landing page:',
          String(error),
        );
      } finally {
        setIsConfiguring(false);
      }
    };
    void configure();
  }, [config]);

  // Handle One Tap sign-in — retained in case One Tap is re-enabled here in
  // future. Without this listener, a credential dispatched by the GSI prompt
  // would have no handler and authentication would silently fail.
  useEffect(() => {
    const handleOneTapSuccess = async (event: Event) => {
      const customEvent = event as CustomEvent<{
        authResponse: { credential?: string };
      }>;
      setIsLoading(true);
      setErrorMessage('');
      try {
        await loginWithOAuth(customEvent.detail.authResponse);
      } catch (error) {
        LOGGER.error(
          'One Tap authentication failed on landing page:',
          String(error),
        );
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Sign-in failed. Please try again.',
        );
      } finally {
        setIsLoading(false);
      }
    };
    const wrapper = (event: Event) => {
      void handleOneTapSuccess(event);
    };
    window.addEventListener('gsi-one-tap-success', wrapper);
    return () => window.removeEventListener('gsi-one-tap-success', wrapper);
  }, [loginWithOAuth]);

  const handleSignIn = useCallback(async () => {
    if (!isConfigured || isLoading || isConfiguring) return;
    setIsLoading(true);
    setErrorMessage('');
    try {
      const oauthResponse = await OAuthProvider.signIn();
      await loginWithOAuth(oauthResponse);
    } catch (error) {
      LOGGER.error('Sign-in failed on landing page:', String(error));
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Sign-in failed. Please try again.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [isConfigured, isConfiguring, isLoading, loginWithOAuth]);

  const handleDiscordSignIn = useCallback(() => {
    // Delegate state generation and cookie binding to the backend.
    // `/oauth/discord/authorize` sets a single-use HttpOnly state cookie
    // and 302s to Discord.
    const oauthProxyUrl = config.oauthProxyUrl;
    if (!oauthProxyUrl) return;
    window.location.href = `${oauthProxyUrl}/discord/authorize`;
  }, [config.oauthProxyUrl]);

  const navStyle = useMemo<React.CSSProperties>(
    () => ({
      background: 'rgba(10,15,26,0.75)',
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      borderBottom: `1px solid rgba(255,255,255,0.08)`,
    }),
    [],
  );

  return (
    <PageContainer style={pageBackgroundStyle}>
      <PageMeta
        title="Fantasy Baseball League Manager"
        description="Legacy Sports — the fantasy baseball league manager built for serious fans. Create leagues, draft players, track stats, and compete with friends."
      />
      {/* ─── Navigation Bar ─── */}
      <XStack
        tag="header"
        position="sticky"
        top={0}
        zIndex={100}
        style={navStyle}
      >
        <XStack
          tag="nav"
          aria-label="Landing"
          width="100%"
          paddingHorizontal="$5"
          paddingVertical="$3"
          alignItems="center"
          justifyContent="space-between"
          $sm={{ paddingHorizontal: '$3' }}
        >
          {/* Logo */}
          <XStack alignItems="center" gap="$2">
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt="Legacy Sports"
              style={{ height: 38, width: 'auto', display: 'block' }}
            />
            <YStack lineHeight={1} gap={0}>
              <Text
                style={{
                  fontFamily: '"Big Shoulders Display", system-ui, sans-serif',
                  fontWeight: '800',
                  fontSize: 14,
                  letterSpacing: '0.04em',
                  lineHeight: '1' as unknown as number,
                  color: BRAND_GOLD_LIGHT,
                }}
              >
                LEGACY
              </Text>
              <Text
                style={{
                  fontFamily: '"Big Shoulders Display", system-ui, sans-serif',
                  fontWeight: '700',
                  fontSize: 11,
                  letterSpacing: '0.16em',
                  lineHeight: '1' as unknown as number,
                  color: '#F8FAFC',
                }}
              >
                SPORTS
              </Text>
            </YStack>
          </XStack>

          {/* Nav sign-in button */}
          <OutlineSignInButton
            onPress={() => {
              void handleSignIn();
            }}
            role="button"
            tabIndex={0}
            aria-label="Sign in"
          >
            <XStack alignItems="center" gap="$2">
              {isLoading ? (
                <Spinner size="small" color={BRAND_GOLD_LIGHT} />
              ) : (
                <Text fontSize="$3" color={BRAND_GOLD_LIGHT} fontWeight="600">
                  Sign In
                </Text>
              )}
            </XStack>
          </OutlineSignInButton>
        </XStack>
      </XStack>

      <YStack tag="main" flex={1}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* ─── Hero Section ─── */}
          <HeroSection style={heroGradientStyle}>
            <ContentContainer alignItems="center" gap="$6">
              {/* Badge */}
              <HeroBadge>
                <BrandIcon
                  name="baseball"
                  size={18}
                  accentColor={BRAND_ICON_ACCENT}
                />
                <Text
                  fontSize="$2"
                  color="$color11"
                  fontWeight="600"
                  letterSpacing={0.5}
                >
                  Fantasy Baseball · Season 2026
                </Text>
              </HeroBadge>

              {/* Hero heading */}
              <YStack alignItems="center" gap="$3" maxWidth={680}>
                <h1 style={heroHeadingStyle}>
                  Build Your Dynasty.
                  <br />
                  Dominate Your League.
                </h1>
                <Text
                  fontSize="$5"
                  color="$color11"
                  textAlign="center"
                  maxWidth={520}
                  lineHeight="$7"
                  $sm={{ fontSize: '$4' }}
                >
                  The only fantasy baseball platform powered by real MLB history
                  — draft legends across every era and compete on archived
                  statistics.
                </Text>
              </YStack>

              {/* CTA Buttons */}
              <YStack gap="$3" alignItems="center">
                <SignInButton
                  onPress={() => {
                    void handleSignIn();
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label="Continue with Google"
                >
                  <XStack
                    alignItems="center"
                    gap="$2.5"
                    minWidth={220}
                    justifyContent="center"
                  >
                    {isLoading || isConfiguring ? (
                      <Spinner size="small" color="$color1" />
                    ) : (
                      <>
                        <BrandIcon name="google" size={18} />
                        <Text fontSize="$4" color="$color1" fontWeight="700">
                          Continue with Google
                        </Text>
                      </>
                    )}
                  </XStack>
                </SignInButton>

                {config.discordClientId ? (
                  <OutlineSignInButton
                    onPress={handleDiscordSignIn}
                    role="button"
                    tabIndex={0}
                    aria-label="Continue with Discord"
                  >
                    <XStack
                      alignItems="center"
                      gap="$2"
                      minWidth={220}
                      justifyContent="center"
                    >
                      {isDiscordLoading ? (
                        <Spinner size="small" color="$color11" />
                      ) : (
                        <>
                          <BrandIcon name="discord" size={16} />
                          <Text fontSize="$3" color="$color11" fontWeight="600">
                            Continue with Discord
                          </Text>
                        </>
                      )}
                    </XStack>
                  </OutlineSignInButton>
                ) : null}
              </YStack>

              {displayError ? (
                <Text fontSize="$3" color="$red9" textAlign="center">
                  {displayError}
                </Text>
              ) : null}

              {/* Social proof + join path */}
              <YStack alignItems="center" gap="$1.5">
                <Text fontSize="$2" color="$color10" textAlign="center">
                  Free to play · No credit card required
                </Text>
                <Text fontSize="$2" color="$color10" textAlign="center">
                  Joining a friend's league?{' '}
                  <Text
                    fontSize="$2"
                    color={BRAND_GOLD_LIGHT}
                    fontWeight="600"
                    textDecorationLine="underline"
                    cursor="pointer"
                    onPress={() => {
                      void handleSignIn();
                    }}
                  >
                    Sign in to enter your invite code →
                  </Text>
                </Text>
              </YStack>
            </ContentContainer>
          </HeroSection>

          {/* ─── How It Works ─── */}
          <YStack
            paddingVertical="$10"
            paddingHorizontal="$5"
            style={{
              background: `linear-gradient(180deg, transparent 0%, ${withAlpha(BRAND_NAVY, 0.1)} 50%, transparent 100%)`,
            }}
            $sm={{ paddingHorizontal: '$3' }}
          >
            <ContentContainer gap="$8">
              <YStack alignItems="center" gap="$2">
                <h2 style={sectionHeadingStyle} aria-label="How it works">
                  How it works
                </h2>
                <Text
                  fontSize="$4"
                  color="$color11"
                  textAlign="center"
                  maxWidth={400}
                  style={{ fontFamily: '"Literata", Georgia, serif' }}
                >
                  Fantasy baseball reimagined around real history.
                </Text>
              </YStack>

              <XStack flexWrap="wrap" gap="$6" justifyContent="center">
                {HOW_IT_WORKS.map((step) => (
                  <StepCard key={step.number}>
                    <span style={stepNumberStyle}>{step.number}</span>
                    <YStack gap="$1.5">
                      <Text
                        fontSize="$5"
                        fontWeight="700"
                        color="$color"
                        style={{
                          fontFamily: '"Big Shoulders Display", sans-serif',
                          letterSpacing: -0.3,
                        }}
                      >
                        {step.title}
                      </Text>
                      <Text
                        fontSize="$3"
                        color="$color11"
                        lineHeight="$5"
                        style={{ fontFamily: '"Literata", Georgia, serif' }}
                      >
                        {step.description}
                      </Text>
                    </YStack>
                  </StepCard>
                ))}
              </XStack>
            </ContentContainer>
          </YStack>

          {/* ─── Features Section ─── */}
          <YStack
            paddingVertical="$10"
            paddingHorizontal="$5"
            $sm={{ paddingHorizontal: '$3' }}
          >
            <ContentContainer gap="$6">
              <YStack alignItems="center" gap="$2">
                <h2 style={sectionHeadingStyle}>Everything you need to win</h2>
                <Text
                  fontSize="$4"
                  color="$color11"
                  textAlign="center"
                  maxWidth={440}
                  style={{ fontFamily: '"Literata", Georgia, serif' }}
                >
                  Powerful tools that give you an edge every single week.
                </Text>
              </YStack>

              <Theme name="dark">
                <YStack gap="$4">
                  {/* Draft Tools — featured, full-width */}
                  <FeaturedDraftCard
                    style={{
                      background: `linear-gradient(135deg, ${BG_DARK} 0%, ${withAlpha(BRAND_NAVY, 0.35)} 100%)`,
                    }}
                  >
                    <XStack
                      gap="$6"
                      flexWrap="wrap"
                      alignItems="flex-start"
                      $sm={{ flexDirection: 'column', gap: '$4' }}
                    >
                      <YStack flex={1} minWidth={220} gap="$3">
                        <FeatureIconCircle>
                          <BrandIcon
                            name="draft"
                            size={24}
                            title="Draft Tools"
                            decorative={false}
                          />
                        </FeatureIconCircle>
                        <YStack gap="$1.5">
                          <Text
                            fontSize="$7"
                            fontWeight="800"
                            color="$color"
                            style={{
                              fontFamily: '"Big Shoulders Display", sans-serif',
                              letterSpacing: -0.5,
                            }}
                          >
                            Draft Tools
                          </Text>
                          <Text
                            fontSize="$4"
                            color="$color11"
                            lineHeight="$6"
                            maxWidth={340}
                            style={{ fontFamily: '"Literata", Georgia, serif' }}
                          >
                            Snake and auction formats with smart historical
                            rankings, position analysis across eras, and mock
                            draft simulations. The draft is the season.
                          </Text>
                        </YStack>
                      </YStack>
                      <YStack
                        flex={0}
                        minWidth={180}
                        gap="$2"
                        paddingTop="$1"
                        $sm={{ display: 'none' }}
                      >
                        {[
                          'Snake draft',
                          'Auction format',
                          'Mock drafts',
                          'Era rankings',
                        ].map((item) => (
                          <XStack key={item} alignItems="center" gap="$2">
                            <YStack
                              width={6}
                              height={6}
                              borderRadius={9999}
                              style={{
                                backgroundColor: BRAND_GOLD,
                                opacity: 0.7,
                              }}
                            />
                            <Text
                              fontSize="$3"
                              color="$color11"
                              style={{
                                fontFamily: '"Literata", Georgia, serif',
                              }}
                            >
                              {item}
                            </Text>
                          </XStack>
                        ))}
                      </YStack>
                    </XStack>
                  </FeaturedDraftCard>

                  {/* Utility features — compact 3-column row */}
                  <XStack flexWrap="wrap" gap="$3">
                    {FEATURES.map((feature) => (
                      <UtilityCard key={feature.label} style={featureCardStyle}>
                        <FeatureIconCircle>
                          <BrandIcon
                            name={feature.icon}
                            size={20}
                            title={feature.title}
                            decorative={false}
                          />
                        </FeatureIconCircle>
                        <YStack gap="$1">
                          <Text
                            fontSize="$3"
                            fontWeight="700"
                            color="$color"
                            style={{
                              fontFamily: '"Big Shoulders Display", sans-serif',
                              letterSpacing: -0.2,
                            }}
                          >
                            {feature.title}
                          </Text>
                          <Text
                            fontSize="$2"
                            color="$color11"
                            lineHeight="$4"
                            style={{ fontFamily: '"Literata", Georgia, serif' }}
                          >
                            {feature.description}
                          </Text>
                        </YStack>
                      </UtilityCard>
                    ))}
                  </XStack>
                </YStack>
              </Theme>
            </ContentContainer>
          </YStack>

          {/* ─── Sports Section ─── */}
          <YStack
            paddingVertical="$10"
            paddingHorizontal="$5"
            style={{
              background: `linear-gradient(180deg, transparent 0%, ${withAlpha(BRAND_NAVY, 0.12)} 50%, transparent 100%)`,
            }}
            $sm={{ paddingHorizontal: '$3' }}
          >
            <ContentContainer gap="$6">
              <YStack alignItems="center" gap="$2">
                <h2 style={sectionHeadingStyle}>Pick your sport</h2>
                <Text
                  fontSize="$4"
                  color="$color11"
                  textAlign="center"
                  maxWidth={400}
                  style={{ fontFamily: '"Literata", Georgia, serif' }}
                >
                  Baseball is live now.
                </Text>
              </YStack>

              <Theme name="dark">
                <XStack flexWrap="wrap" gap="$5" justifyContent="center">
                  {SPORTS.map((sport) => (
                    <SportCard
                      key={sport.label}
                      style={sportCardStyle(sport.accent)}
                    >
                      <XStack alignItems="center" gap="$3">
                        <YStack
                          width={56}
                          height={56}
                          borderRadius="$5"
                          alignItems="center"
                          justifyContent="center"
                          backgroundColor="$surfaceInteractive"
                          borderWidth={1}
                          borderColor="$glassBorder"
                        >
                          <BrandIcon
                            name={sport.icon}
                            size={28}
                            title={sport.title}
                            decorative={false}
                          />
                        </YStack>
                        <YStack gap="$1" flex={1}>
                          <XStack alignItems="center" gap="$2">
                            <Text fontSize="$5" fontWeight="800" color="$color">
                              {sport.title}
                            </Text>
                            {!sport.available && (
                              <XStack
                                paddingHorizontal="$2"
                                paddingVertical="$0.5"
                                borderRadius="$4"
                                backgroundColor="$surfaceInteractive"
                                borderWidth={1}
                                borderColor="$glassBorder"
                              >
                                <Text
                                  fontSize={11}
                                  color="$color11"
                                  fontWeight="600"
                                >
                                  Coming Soon
                                </Text>
                              </XStack>
                            )}
                            {sport.available && (
                              <XStack
                                paddingHorizontal="$2"
                                paddingVertical="$0.5"
                                borderRadius="$4"
                                style={{
                                  background: withAlpha(BRAND_NAVY_LIGHT, 0.5),
                                  border: `1px solid ${withAlpha(BRAND_NAVY_LIGHT, 0.6)}`,
                                }}
                              >
                                <Text
                                  fontSize={11}
                                  fontWeight="600"
                                  style={{ color: BRAND_GOLD_LIGHT }}
                                >
                                  Live Now
                                </Text>
                              </XStack>
                            )}
                          </XStack>
                          <Text fontSize="$3" color="$color11" lineHeight="$5">
                            {sport.description}
                          </Text>
                        </YStack>
                      </XStack>
                    </SportCard>
                  ))}
                </XStack>
              </Theme>
            </ContentContainer>
          </YStack>

          {/* ─── Bottom CTA ─── */}
          <YStack
            paddingVertical="$12"
            paddingHorizontal="$5"
            alignItems="center"
            gap="$5"
            $sm={{ paddingHorizontal: '$3', paddingVertical: '$8' }}
          >
            <YStack alignItems="center" gap="$3" maxWidth={500}>
              <h2 style={sectionHeadingStyle}>Ready to play?</h2>
              <Text
                fontSize="$4"
                color="$color11"
                textAlign="center"
                style={{ fontFamily: '"Literata", Georgia, serif' }}
              >
                Start your dynasty. Your first season is free.
              </Text>
            </YStack>

            <SignInButton
              onPress={() => {
                void handleSignIn();
              }}
              role="button"
              tabIndex={0}
              aria-label="Start playing free"
            >
              <XStack
                alignItems="center"
                gap="$2.5"
                minWidth={200}
                justifyContent="center"
              >
                {isLoading || isConfiguring ? (
                  <Spinner size="small" color="$color1" />
                ) : (
                  <Text fontSize="$4" color="$color1" fontWeight="700">
                    Start Playing Free
                  </Text>
                )}
              </XStack>
            </SignInButton>
          </YStack>

          {/* ─── Footer ─── */}
          <YStack
            tag="footer"
            paddingVertical="$5"
            paddingHorizontal="$5"
            borderTopWidth={1}
            borderTopColor="$glassBorder"
            alignItems="center"
            gap="$2"
            $sm={{ paddingHorizontal: '$3' }}
          >
            <Text fontSize="$2" color="$color10" textAlign="center">
              © {new Date().getFullYear()} Legacy Sports · All rights reserved
            </Text>
            <XStack gap="$4" flexWrap="wrap" justifyContent="center">
              <Text
                tag="a"
                fontSize="$2"
                color="$color10"
                style={{ cursor: 'pointer', textDecorationLine: 'underline' }}
                onPress={() => {
                  window.location.href = '/privacy';
                }}
              >
                Privacy Policy
              </Text>
              <Text
                tag="a"
                fontSize="$2"
                color="$color10"
                style={{ cursor: 'pointer', textDecorationLine: 'underline' }}
                onPress={() => {
                  window.location.href = '/terms';
                }}
              >
                Terms of Service
              </Text>
            </XStack>
          </YStack>
        </ScrollView>
      </YStack>
    </PageContainer>
  );
}
