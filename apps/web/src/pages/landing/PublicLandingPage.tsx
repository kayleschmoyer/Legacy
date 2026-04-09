import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { LOGGER } from '@legacy-sports/logging';
import {
  OAuthProvider,
  XStack,
  YStack,
} from '@legacy-sports/shared-components/ui';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { ScrollView, Spinner, styled, Text } from 'tamagui';
import { BrandIcon, type BrandIconName } from '../../components/icons';
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
  DISCORD_BLURPLE,
  DISCORD_BLURPLE_DARK,
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

const FeatureCard = styled(YStack, {
  flex: 1,
  minWidth: 220,
  borderRadius: '$6',
  borderWidth: 1,
  borderColor: '$glassBorder',
  padding: '$5',
  gap: '$3',
  animation: 'medium',
  hoverStyle: {
    borderColor: '$glassBorderHover',
    transform: 'translateY(-2px)',
  },
  $sm: {
    minWidth: '100%',
    padding: '$4',
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
  fontWeight: 900,
  textAlign: 'center',
  letterSpacing: -1,
  lineHeight: 1.1,
  fontSize: 'clamp(2.5rem, 6vw, 4rem)',
  background: `linear-gradient(135deg, #F5F7FA 0%, ${BRAND_GOLD_LIGHT} 60%, ${BRAND_GOLD} 100%)`,
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
  color: BRAND_GOLD_LIGHT,
};

const featureCardGlassStyle: React.CSSProperties = {
  background: `linear-gradient(135deg, ${withAlpha(BG_DARK, 0.72)} 0%, ${withAlpha(BRAND_NAVY, 0.35)} 100%)`,
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
};

const sportCardGlassStyle = (accentColor: string): React.CSSProperties => ({
  background: `linear-gradient(135deg, ${withAlpha(BG_DARK, 0.85)} 0%, ${accentColor} 100%)`,
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
});

/* ─── Feature & Sport Data ─── */

const FEATURES = [
  {
    icon: 'stats' as const,
    label: 'stats',
    title: 'Live Stats',
    description:
      'Real-time player statistics, projections, and performance trends updated as the game unfolds.',
  },
  {
    icon: 'draft' as const,
    label: 'draft',
    title: 'Draft Tools',
    description:
      'Snake and auction drafts with smart rankings, position analysis, and mock draft simulations.',
  },
  {
    icon: 'live' as const,
    label: 'realtime',
    title: 'Instant Updates',
    description:
      'WebSocket-powered live scoring and lineup lock notifications so you never miss a move.',
  },
  {
    icon: 'secure' as const,
    label: 'secure',
    title: 'Secure Leagues',
    description:
      'Private invite codes, commissioner controls, and fair waiver rules for your perfect league.',
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
  {
    icon: 'football' as const,
    label: 'football',
    title: 'Football',
    description:
      'Manage lineups, trade players, and lead your team through every game week.',
    accent: withAlpha('#16A34A', 0.35),
    available: false,
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

/** Build the Discord OAuth2 authorization URL. */
function buildDiscordAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify email',
    state,
  });
  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

const DISCORD_LOGIN_STATE_KEY = 'discord_oauth_login_state';

export function PublicLandingPage(): React.JSX.Element {
  const { config, loginWithOAuth, error: authError } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isDiscordLoading, setIsDiscordLoading] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
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

    // Validate state to prevent CSRF / authorization-code injection
    let storedState: string | null = null;
    try {
      if (typeof sessionStorage !== 'undefined') {
        storedState = sessionStorage.getItem(DISCORD_LOGIN_STATE_KEY);
        sessionStorage.removeItem(DISCORD_LOGIN_STATE_KEY);
      }
    } catch {
      // sessionStorage unavailable
    }

    if (!code || !state || state !== storedState) {
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
          body: JSON.stringify({ code }),
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

  // Configure OAuth on mount
  useEffect(() => {
    const configure = async () => {
      try {
        await OAuthProvider.configure(config);
        setIsConfigured(true);
      } catch (error) {
        LOGGER.error(
          'Failed to configure OAuth on landing page:',
          String(error),
        );
      }
    };
    void configure();
  }, [config]);

  // Handle One Tap sign-in — fires when the user taps the GSI prompt that
  // OAuthProvider.configure() shows on this page. Without this listener the
  // credential is dispatched to no handler and authentication silently fails.
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
    if (!isConfigured || isLoading) return;
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
  }, [isConfigured, isLoading, loginWithOAuth]);

  const handleDiscordSignIn = useCallback(() => {
    const clientId = config.discordClientId;
    if (!clientId) return;

    // Generate a cryptographically random state to prevent CSRF / code injection
    const stateBytes = new Uint8Array(16);
    window.crypto.getRandomValues(stateBytes);
    const state = Array.from(stateBytes, (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(DISCORD_LOGIN_STATE_KEY, state);
      }
    } catch {
      // sessionStorage unavailable — state won't survive redirect, abort
      return;
    }

    const appBaseUrl = new URL(
      import.meta.env.BASE_URL,
      window.location.origin,
    );
    const redirectUri = new URL('auth/discord/callback', appBaseUrl).toString();
    window.location.href = buildDiscordAuthUrl(clientId, redirectUri, state);
  }, [config.discordClientId]);

  const navGlassStyle = useMemo<React.CSSProperties>(
    () => ({
      background: `${withAlpha(BG_DARK, 0.88)}`,
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderBottom: `1px solid ${withAlpha(BRAND_NAVY, 0.4)}`,
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
        position="sticky"
        top={0}
        zIndex={100}
        paddingHorizontal="$5"
        paddingVertical="$3"
        alignItems="center"
        justifyContent="space-between"
        style={navGlassStyle}
        $sm={{ paddingHorizontal: '$3' }}
      >
        {/* Logo */}
        <XStack alignItems="center" gap="$2">
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt=""
            aria-hidden="true"
            style={{ height: 38, width: 'auto', display: 'block' }}
          />
          <Text
            fontSize="$5"
            fontWeight="800"
            color={BRAND_GOLD}
            letterSpacing={-0.5}
          >
            Legacy Sports
          </Text>
        </XStack>

        {/* Nav sign-in button */}
        <OutlineSignInButton
          onPress={() => {
            void handleSignIn();
          }}
          role="button"
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

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* ─── Hero Section ─── */}
        <HeroSection style={heroGradientStyle}>
          <ContentContainer alignItems="center" gap="$6">
            {/* Badge */}
            <HeroBadge>
              <BrandIcon name="baseball" size={16} />
              <Text
                fontSize="$2"
                color="$accentPrimary"
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
                The only fantasy baseball platform powered by real MLB history —
                draft legends across every era and compete on archived
                statistics.
              </Text>
            </YStack>

            {/* CTA Buttons */}
            <XStack gap="$3" flexWrap="wrap" justifyContent="center">
              <SignInButton
                onPress={() => {
                  void handleSignIn();
                }}
                role="button"
                aria-label="Get started with Google"
              >
                <XStack
                  alignItems="center"
                  gap="$2.5"
                  minWidth={200}
                  justifyContent="center"
                >
                  {isLoading ? (
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
                <SignInButton
                  onPress={handleDiscordSignIn}
                  role="button"
                  aria-label="Get started with Discord"
                  backgroundColor={DISCORD_BLURPLE}
                  hoverStyle={{
                    backgroundColor: DISCORD_BLURPLE_DARK,
                    transform: 'translateY(-2px)',
                  }}
                >
                  <XStack
                    alignItems="center"
                    gap="$2.5"
                    minWidth={200}
                    justifyContent="center"
                  >
                    {isDiscordLoading ? (
                      <Spinner size="small" color="$color1" />
                    ) : (
                      <>
                        <BrandIcon name="discord" size={18} />
                        <Text fontSize="$4" color="$color1" fontWeight="700">
                          Continue with Discord
                        </Text>
                      </>
                    )}
                  </XStack>
                </SignInButton>
              ) : null}
            </XStack>

            {displayError ? (
              <Text fontSize="$3" color="$red9" textAlign="center">
                {displayError}
              </Text>
            ) : null}

            {/* Social proof */}
            <Text fontSize="$2" color="$color10" textAlign="center">
              Free to play · No credit card required
            </Text>
          </ContentContainer>
        </HeroSection>

        {/* ─── Features Section ─── */}
        <YStack
          paddingVertical="$10"
          paddingHorizontal="$5"
          $sm={{ paddingHorizontal: '$3' }}
        >
          <ContentContainer gap="$6">
            <YStack alignItems="center" gap="$2">
              <Text
                fontSize="$8"
                fontWeight="800"
                color="$color"
                textAlign="center"
                letterSpacing={-0.5}
              >
                Everything you need to win
              </Text>
              <Text
                fontSize="$4"
                color="$color11"
                textAlign="center"
                maxWidth={440}
              >
                Powerful tools that give you an edge every single week.
              </Text>
            </YStack>

            <XStack flexWrap="wrap" gap="$4" justifyContent="center">
              {FEATURES.map((feature) => (
                <FeatureCard key={feature.label} style={featureCardGlassStyle}>
                  <FeatureIconCircle>
                    <BrandIcon
                      name={feature.icon}
                      size={22}
                      title={feature.title}
                      decorative={false}
                    />
                  </FeatureIconCircle>
                  <YStack gap="$1">
                    <Text fontSize="$4" fontWeight="700" color="$color">
                      {feature.title}
                    </Text>
                    <Text fontSize="$3" color="$color11" lineHeight="$5">
                      {feature.description}
                    </Text>
                  </YStack>
                </FeatureCard>
              ))}
            </XStack>
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
              <Text
                fontSize="$8"
                fontWeight="800"
                color="$color"
                textAlign="center"
                letterSpacing={-0.5}
              >
                Pick your sport
              </Text>
              <Text
                fontSize="$4"
                color="$color11"
                textAlign="center"
                maxWidth={400}
              >
                Baseball is live now. Football is coming soon.
              </Text>
            </YStack>

            <XStack flexWrap="wrap" gap="$5" justifyContent="center">
              {SPORTS.map((sport) => (
                <SportCard
                  key={sport.label}
                  style={sportCardGlassStyle(sport.accent)}
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
            <Text
              fontSize="$8"
              fontWeight="800"
              color="$color"
              textAlign="center"
              letterSpacing={-0.5}
            >
              Ready to play?
            </Text>
            <Text fontSize="$4" color="$color11" textAlign="center">
              Join your league, draft your team, and start competing today.
            </Text>
          </YStack>

          <XStack gap="$3" flexWrap="wrap" justifyContent="center">
            <SignInButton
              onPress={() => {
                void handleSignIn();
              }}
              role="button"
              aria-label="Get started"
            >
              <XStack
                alignItems="center"
                gap="$2.5"
                minWidth={180}
                justifyContent="center"
              >
                {isLoading ? (
                  <Spinner size="small" color="$color1" />
                ) : (
                  <Text fontSize="$4" color="$color1" fontWeight="700">
                    Get Started Free
                  </Text>
                )}
              </XStack>
            </SignInButton>
            {config.discordClientId ? (
              <SignInButton
                onPress={handleDiscordSignIn}
                role="button"
                aria-label="Get started with Discord"
                style={{ backgroundColor: DISCORD_BLURPLE }}
                hoverStyle={{ backgroundColor: DISCORD_BLURPLE_DARK }}
              >
                <XStack
                  alignItems="center"
                  gap="$2.5"
                  minWidth={180}
                  justifyContent="center"
                >
                  {isDiscordLoading ? (
                    <Spinner size="small" color="$color1" />
                  ) : (
                    <>
                      <BrandIcon name="discord" size={18} />
                      <Text fontSize="$4" color="$color1" fontWeight="700">
                        Continue with Discord
                      </Text>
                    </>
                  )}
                </XStack>
              </SignInButton>
            ) : null}
          </XStack>

          {errorMessage ? (
            <Text fontSize="$3" color="$red9" textAlign="center">
              {errorMessage}
            </Text>
          ) : null}
        </YStack>

        {/* ─── Footer ─── */}
        <YStack
          paddingVertical="$5"
          paddingHorizontal="$5"
          borderTopWidth={1}
          borderTopColor="$glassBorder"
          alignItems="center"
          $sm={{ paddingHorizontal: '$3' }}
        >
          <Text fontSize="$2" color="$color10" textAlign="center">
            © {new Date().getFullYear()} Legacy Sports · All rights reserved
          </Text>
        </YStack>
      </ScrollView>
    </PageContainer>
  );
}
