import React, { useCallback, useEffect, useState } from 'react';
import { LOGGER } from '@legacy-sports/logging';
import { OAuthProvider, XStack } from '@legacy-sports/shared-components/ui';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { Spinner } from 'tamagui';
import { BrandIcon } from '../../components/icons';
import { PageMeta } from '../../components/PageMeta';
import { storeCsrfToken } from '../../lib/csrf';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_DARK,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  DISCORD_BLURPLE,
  DISCORD_BLURPLE_DARK,
  SURFACE_SUBTLE,
  TEXT_MUTED,
  withAlpha,
} from '../../constants/colors';

/* ─── Styles ─── */

const leftPanelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  flex: '0 0 55%',
  padding: '3rem 4rem',
  position: 'relative',
  overflow: 'hidden',
  background: `
    radial-gradient(ellipse at 30% 20%, ${withAlpha(BRAND_NAVY, 0.55)} 0%, transparent 60%),
    radial-gradient(ellipse at 70% 80%, ${withAlpha(BRAND_SEAM_RED, 0.12)} 0%, transparent 50%),
    radial-gradient(ellipse at 10% 90%, ${withAlpha(BRAND_GOLD, 0.07)} 0%, transparent 45%),
    ${BG_DARK}
  `,
};

const leftPanelContentStyle: React.CSSProperties = {
  position: 'relative',
  zIndex: 1,
  maxWidth: 440,
  width: '100%',
};

const scoreboardLineStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: 3,
  background: `linear-gradient(90deg, transparent 0%, ${BRAND_GOLD} 30%, ${withAlpha(BRAND_GOLD, 0.4)} 70%, transparent 100%)`,
  opacity: 0.6,
};

const rightPanelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  flex: '0 0 45%',
  padding: '3rem 2.5rem',
  backgroundColor: SURFACE_SUBTLE,
  borderLeft: `1px solid ${withAlpha(BRAND_NAVY, 0.35)}`,
};

const authCardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 380,
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
};

const dividerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
};

const dividerLineStyle: React.CSSProperties = {
  flex: 1,
  height: 1,
  backgroundColor: withAlpha(BRAND_NAVY, 0.5),
};

const googleButtonStyle = (
  hover: boolean,
  loading: boolean,
): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.625rem',
  width: '100%',
  padding: '0.875rem 1.5rem',
  borderRadius: '0.5rem',
  backgroundColor: hover ? BRAND_NAVY : BRAND_NAVY_LIGHT,
  border: 'none',
  cursor: loading ? 'not-allowed' : 'pointer',
  opacity: loading ? 0.7 : 1,
  transform: hover && !loading ? 'translateY(-1px)' : 'none',
  transition: 'all 150ms ease-out',
  fontFamily: '"Literata", Georgia, serif',
  fontWeight: 600,
  fontSize: '0.9375rem',
  color: '#F8FAFC',
  letterSpacing: 0.1,
});

const discordButtonStyle = (
  hover: boolean,
  loading: boolean,
): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.625rem',
  width: '100%',
  padding: '0.875rem 1.5rem',
  borderRadius: '0.5rem',
  backgroundColor: hover ? DISCORD_BLURPLE_DARK : DISCORD_BLURPLE,
  border: 'none',
  cursor: loading ? 'not-allowed' : 'pointer',
  opacity: loading ? 0.7 : 1,
  transform: hover && !loading ? 'translateY(-1px)' : 'none',
  transition: 'all 150ms ease-out',
  fontFamily: '"Literata", Georgia, serif',
  fontWeight: 600,
  fontSize: '0.9375rem',
  color: '#FFFFFF',
  letterSpacing: 0.1,
});

const errorStyle: React.CSSProperties = {
  padding: '0.75rem 1rem',
  borderRadius: '0.5rem',
  backgroundColor: withAlpha(BRAND_SEAM_RED, 0.12),
  border: `1px solid ${withAlpha(BRAND_SEAM_RED, 0.35)}`,
  fontFamily: '"Literata", Georgia, serif',
  fontSize: '0.875rem',
  color: '#E63950',
  lineHeight: 1.5,
};

/* ─── Decorative stitch marks ─── */
function StitchDecoration() {
  return (
    <svg
      width="160"
      height="160"
      viewBox="0 0 160 160"
      fill="none"
      aria-hidden="true"
      style={{
        position: 'absolute',
        bottom: -20,
        right: -20,
        opacity: 0.055,
        pointerEvents: 'none',
      }}
    >
      <circle cx="80" cy="80" r="70" stroke={BRAND_GOLD} strokeWidth="1.5" />
      <path
        d="M80 10 C95 40, 115 55, 150 80 C115 105, 95 120, 80 150"
        stroke={BRAND_GOLD}
        strokeWidth="1"
        fill="none"
        strokeDasharray="4 4"
      />
      <path
        d="M80 10 C65 40, 45 55, 10 80 C45 105, 65 120, 80 150"
        stroke={BRAND_GOLD}
        strokeWidth="1"
        fill="none"
        strokeDasharray="4 4"
      />
      {[...Array(7)].map((_, i) => {
        const t = i / 6;
        const x1 = 80 + 70 * Math.sin(Math.PI * t) * 0.18;
        const y1 = 10 + 140 * t - 5;
        return (
          <line
            key={i}
            x1={x1 - 4}
            y1={y1}
            x2={x1 + 4}
            y2={y1 + 2}
            stroke={BRAND_GOLD}
            strokeWidth="0.8"
          />
        );
      })}
    </svg>
  );
}

/* ─── Constants ─── */
const DISCORD_LOGIN_STATE_KEY = 'discord_oauth_login_state';

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

/* ─── Component ─── */
export function LoginPage(): React.JSX.Element {
  const { config, loginWithOAuth, error: authError } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isDiscordLoading, setIsDiscordLoading] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [isConfiguring, setIsConfiguring] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [googleHover, setGoogleHover] = useState(false);
  const [discordHover, setDiscordHover] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);

  const displayError = errorMessage || authError || '';

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)');
    setIsNarrow(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsNarrow(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.location.pathname.endsWith('/auth/discord/callback')) return;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');

    if (error) {
      setErrorMessage('Discord sign-in was cancelled or denied.');
      return;
    }

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

        if (result.csrfToken) {
          storeCsrfToken(result.csrfToken);
        }

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
          LOGGER.warn(
            'Failed to decode Discord JWT payload for session pre-cache',
            err instanceof Error ? err : String(err),
          );
        }

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

  useEffect(() => {
    const configure = async () => {
      try {
        await OAuthProvider.configure({
          ...config,
          gsi: { ...(config.gsi ?? {}), oneTap: false },
        });
        setIsConfigured(true);
      } catch (error) {
        LOGGER.error('Failed to configure OAuth on login page:', String(error));
      } finally {
        setIsConfiguring(false);
      }
    };
    void configure();
  }, [config]);

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
          'One Tap authentication failed on login page:',
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
      LOGGER.error('Sign-in failed on login page:', String(error));
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
    const clientId = config.discordClientId;
    if (!clientId) return;

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
      return;
    }

    const appBaseUrl = new URL(
      import.meta.env.BASE_URL,
      window.location.origin,
    );
    const redirectUri = new URL('auth/discord/callback', appBaseUrl).toString();
    window.location.href = buildDiscordAuthUrl(clientId, redirectUri, state);
  }, [config.discordClientId]);

  const logoNav = (
    <header
      style={{
        padding: '1.25rem 2.5rem',
        borderBottom: `1px solid ${withAlpha(BRAND_NAVY, 0.3)}`,
        backgroundColor: BG_DARK,
      }}
    >
      <nav aria-label="Landing">
        <XStack alignItems="center" gap="$2">
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="Legacy Sports"
            style={{ height: 36, width: 'auto', display: 'block' }}
          />
          <span
            style={{
              fontFamily: '"Big Shoulders Display", sans-serif',
              fontWeight: 800,
              fontSize: '1.25rem',
              color: BRAND_GOLD,
              letterSpacing: -0.5,
            }}
          >
            Legacy Sports
          </span>
        </XStack>
      </nav>
    </header>
  );

  const authPanel = (
    <div style={authCardStyle}>
      {/* Heading */}
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}
      >
        <h1
          style={{
            margin: 0,
            fontFamily: '"Big Shoulders Display", sans-serif',
            fontWeight: 800,
            fontSize: '1.875rem',
            color: '#F8FAFC',
            letterSpacing: -0.5,
            lineHeight: 1.1,
          }}
        >
          Sign in to your account
        </h1>
        <p
          style={{
            margin: 0,
            fontFamily: '"Literata", Georgia, serif',
            fontSize: '0.9375rem',
            color: TEXT_MUTED,
            lineHeight: 1.5,
          }}
        >
          Your leagues are waiting.
        </p>
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <button
          style={googleButtonStyle(googleHover, isLoading || isConfiguring)}
          onMouseEnter={() => setGoogleHover(true)}
          onMouseLeave={() => setGoogleHover(false)}
          onClick={() => {
            void handleSignIn();
          }}
          disabled={isLoading || isConfiguring}
          aria-label="Continue with Google"
        >
          {isLoading || isConfiguring ? (
            <Spinner size="small" color="$color1" />
          ) : (
            <>
              <BrandIcon name="google" size={18} />
              Continue with Google
            </>
          )}
        </button>

        {config.discordClientId ? (
          <button
            style={discordButtonStyle(discordHover, isDiscordLoading)}
            onMouseEnter={() => setDiscordHover(true)}
            onMouseLeave={() => setDiscordHover(false)}
            onClick={handleDiscordSignIn}
            disabled={isDiscordLoading}
            aria-label="Continue with Discord"
          >
            {isDiscordLoading ? (
              <Spinner size="small" color="$color1" />
            ) : (
              <>
                <BrandIcon name="discord" size={16} />
                Continue with Discord
              </>
            )}
          </button>
        ) : null}
      </div>

      {/* Error */}
      {displayError ? (
        <div style={errorStyle} role="alert">
          {displayError}
        </div>
      ) : null}

      {/* Divider */}
      <div style={dividerStyle} aria-hidden="true">
        <div style={dividerLineStyle} />
        <span
          style={{
            fontFamily: '"Literata", Georgia, serif',
            fontSize: '0.75rem',
            color: withAlpha(TEXT_MUTED, 0.6),
            whiteSpace: 'nowrap',
          }}
        >
          or
        </span>
        <div style={dividerLineStyle} />
      </div>

      {/* Social proof & invite */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.375rem',
          alignItems: 'center',
        }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: '"Literata", Georgia, serif',
            fontSize: '0.8125rem',
            color: withAlpha(TEXT_MUTED, 0.7),
            textAlign: 'center',
          }}
        >
          Free to play · No credit card required
        </p>
        <p
          style={{
            margin: 0,
            fontFamily: '"Literata", Georgia, serif',
            fontSize: '0.8125rem',
            color: withAlpha(TEXT_MUTED, 0.7),
            textAlign: 'center',
          }}
        >
          Joining a league?{' '}
          <button
            onClick={() => {
              void handleSignIn();
            }}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              fontFamily: '"Literata", Georgia, serif',
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: BRAND_GOLD_LIGHT,
              textDecoration: 'underline',
            }}
          >
            Sign in to enter your invite code →
          </button>
        </p>
      </div>

      {/* Footer links */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '1.5rem',
          paddingTop: '0.25rem',
        }}
      >
        {(['Privacy Policy', 'Terms of Service'] as const).map((label) => (
          <a
            key={label}
            href={label === 'Privacy Policy' ? '/privacy' : '/terms'}
            style={{
              fontFamily: '"Literata", Georgia, serif',
              fontSize: '0.75rem',
              color: withAlpha(TEXT_MUTED, 0.5),
              textDecoration: 'underline',
              cursor: 'pointer',
            }}
          >
            {label}
          </a>
        ))}
      </div>
    </div>
  );

  if (isNarrow) {
    return (
      <>
        <PageMeta
          title="Sign In — Legacy Sports"
          description="Sign in to Legacy Sports to access your fantasy baseball leagues, draft tools, and live stats."
        />
        <div
          style={{
            minHeight: '100vh',
            backgroundColor: BG_DARK,
            display: 'flex',
            flexDirection: 'column',
            background: `
              radial-gradient(ellipse at 50% 0%, ${withAlpha(BRAND_NAVY, 0.35)} 0%, transparent 60%),
              ${BG_DARK}
            `,
          }}
        >
          {logoNav}
          <main
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '2rem 1.5rem',
            }}
          >
            {authPanel}
          </main>
        </div>
      </>
    );
  }

  return (
    <>
      <PageMeta
        title="Sign In — Legacy Sports"
        description="Sign in to Legacy Sports to access your fantasy baseball leagues, draft tools, and live stats."
      />
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: BG_DARK,
        }}
      >
        {logoNav}
        <main style={{ display: 'flex', flex: 1 }}>
          {/* Left: Brand panel */}
          <div style={leftPanelStyle}>
            <div style={scoreboardLineStyle} />
            <StitchDecoration />

            <div style={leftPanelContentStyle}>
              {/* Season badge */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.375rem 0.875rem',
                  borderRadius: 9999,
                  backgroundColor: withAlpha(BRAND_NAVY, 0.5),
                  border: `1px solid ${withAlpha(BRAND_NAVY_LIGHT, 0.4)}`,
                  marginBottom: '1.5rem',
                }}
              >
                <BrandIcon name="baseball" size={14} />
                <span
                  style={{
                    fontFamily: '"Literata", Georgia, serif',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: BRAND_GOLD_LIGHT,
                    letterSpacing: 0.5,
                  }}
                >
                  Fantasy Baseball · Season 2026
                </span>
              </div>

              {/* Headline */}
              <h2
                style={{
                  margin: '0 0 1rem',
                  fontFamily: '"Big Shoulders Display", sans-serif',
                  fontWeight: 800,
                  fontSize: 'clamp(2.5rem, 4vw, 3.5rem)',
                  color: BRAND_GOLD_DARK,
                  letterSpacing: -1,
                  lineHeight: 1.05,
                }}
              >
                Build Your Dynasty.
              </h2>

              <p
                style={{
                  margin: '0 0 2.5rem',
                  fontFamily: '"Literata", Georgia, serif',
                  fontSize: '1.0625rem',
                  color: TEXT_MUTED,
                  lineHeight: 1.65,
                  maxWidth: 360,
                }}
              >
                The only fantasy baseball platform powered by real MLB history —
                draft legends across every era and compete on archived
                statistics.
              </p>

              {/* Stats row */}
              <div
                style={{
                  display: 'flex',
                  gap: '2rem',
                  paddingTop: '2rem',
                  borderTop: `1px solid ${withAlpha(BRAND_NAVY_LIGHT, 0.25)}`,
                }}
              >
                {[
                  { value: '100+', label: 'Seasons of stats' },
                  { value: '15K+', label: 'Historical players' },
                  { value: 'Free', label: 'To play' },
                ].map(({ value, label }) => (
                  <div
                    key={label}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.25rem',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: '"Big Shoulders Display", sans-serif',
                        fontWeight: 700,
                        fontSize: '1.5rem',
                        color: BRAND_GOLD,
                        fontVariantNumeric: 'tabular-nums',
                        lineHeight: 1,
                      }}
                    >
                      {value}
                    </span>
                    <span
                      style={{
                        fontFamily: '"Literata", Georgia, serif',
                        fontSize: '0.75rem',
                        color: withAlpha(TEXT_MUTED, 0.7),
                        letterSpacing: 0.2,
                      }}
                    >
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Auth panel */}
          <div style={rightPanelStyle}>{authPanel}</div>
        </main>
      </div>
    </>
  );
}
