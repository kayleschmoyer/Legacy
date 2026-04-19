import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { LOGGER } from '@legacy-sports/logging';
import { OAuthProvider } from '@legacy-sports/shared-components/ui';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { PageMeta } from '../../components/PageMeta';
import { storeCsrfToken } from '../../lib/csrf';
import {
  useGetOnThisDayQuery,
  useGetPlayerCountQuery,
} from '../../api/db/graphql.generated';
import './LoginPage.css';

/* ── Icons ── */

function GoogleG() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.2 5.2C41 35 44 30 44 24c0-1.3-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}

function DiscordMark() {
  return (
    <svg width="20" height="16" viewBox="0 0 71 55" aria-hidden="true">
      <path
        fill="#fff"
        d="M60.1 4.9A58.5 58.5 0 0 0 45.4.4a.2.2 0 0 0-.2.1 40.8 40.8 0 0 0-1.8 3.7 54 54 0 0 0-16.2 0A37.5 37.5 0 0 0 25.4.5a.2.2 0 0 0-.2-.1 58.4 58.4 0 0 0-14.7 4.5.2.2 0 0 0-.1.1C1.2 18.7-1.4 32.1.1 45.3a.2.2 0 0 0 .1.2 58.9 58.9 0 0 0 17.7 9 .2.2 0 0 0 .3-.1 42 42 0 0 0 3.6-5.9.2.2 0 0 0-.1-.3 38.8 38.8 0 0 1-5.5-2.6.2.2 0 0 1 0-.4l1.1-.8a.2.2 0 0 1 .2 0 42 42 0 0 0 35.6 0 .2.2 0 0 1 .2 0l1.1.8a.2.2 0 0 1 0 .4 36.4 36.4 0 0 1-5.5 2.6.2.2 0 0 0-.1.3 47 47 0 0 0 3.6 5.9.2.2 0 0 0 .3.1 58.7 58.7 0 0 0 17.7-9 .2.2 0 0 0 .1-.2c1.8-15.3-2.3-28.6-9.8-40.3a.2.2 0 0 0-.1-.1zM23.7 37.3c-3.5 0-6.4-3.2-6.4-7.1 0-4 2.8-7.2 6.4-7.2 3.6 0 6.5 3.2 6.4 7.2 0 3.9-2.8 7.1-6.4 7.1zm23.6 0c-3.5 0-6.4-3.2-6.4-7.1 0-4 2.8-7.2 6.4-7.2 3.6 0 6.5 3.2 6.4 7.2 0 3.9-2.8 7.1-6.4 7.1z"
      />
    </svg>
  );
}

function SecureIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 3 6 7v9c0 6.1 4.3 11.5 10 13 5.7-1.5 10-6.9 10-13V7l-10-4z" />
      <path d="m11 16 3.5 3.5L21 13" stroke="#C5A55A" />
    </svg>
  );
}

/* ── Constants ── */
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

/* ── Helpers ── */

function formatBattingMarquee(
  lastName: string,
  hits: number | null | undefined,
  atBats: number | null | undefined,
  homeRuns: number | null | undefined,
  rbi: number | null | undefined,
): { name: string; score: string; stat: string } {
  const score = hits != null && atBats != null ? `${hits}-${atBats}` : '';
  const parts: string[] = [];
  if (homeRuns) parts.push(`${homeRuns} HR`);
  if (rbi) parts.push(`${rbi} RBI`);
  return { name: lastName.toUpperCase(), score, stat: parts.join(' · ') };
}

function formatPitchingMarquee(
  lastName: string,
  inningsPitched: number | null | undefined,
  strikeouts: number | null | undefined,
  earnedRuns: number | null | undefined,
): { name: string; score: string; stat: string } {
  const score = inningsPitched != null ? `${inningsPitched} IP` : '';
  const parts: string[] = [];
  if (strikeouts) parts.push(`${strikeouts} K`);
  if (earnedRuns != null) parts.push(`${earnedRuns} ER`);
  return { name: lastName.toUpperCase(), score, stat: parts.join(' · ') };
}

/* ── Component ── */
export function LoginPage(): React.JSX.Element {
  const { config, loginWithOAuth, error: authError } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isDiscordLoading, setIsDiscordLoading] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [isConfiguring, setIsConfiguring] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const today = useMemo(() => new Date(), []);
  const todayMonth = today.getMonth() + 1;
  const todayDay = today.getDate();

  const { data: playerCountData } = useGetPlayerCountQuery({
    fetchPolicy: 'cache-first',
  });
  const { data: onThisDayData } = useGetOnThisDayQuery({
    variables: { month: todayMonth, day: todayDay, limit: 8 },
    fetchPolicy: 'cache-first',
  });

  const playerCount = playerCountData?.playerCount ?? 22184;
  const playerCountDisplay = playerCount.toLocaleString('en-US');

  const marqueeEntries = useMemo(() => {
    const entries = onThisDayData?.onThisDay;
    if (!entries || entries.length === 0) return null;
    const picked = entries.slice(0, 4);
    return picked.map((e) => {
      if (e.entryType === 'batting') {
        return formatBattingMarquee(
          e.lastName ?? '',
          e.hits,
          e.atBats,
          e.homeRuns,
          e.rbi,
        );
      }
      return formatPitchingMarquee(
        e.lastName ?? '',
        e.inningsPitched,
        e.strikeouts,
        e.earnedRuns,
      );
    });
  }, [onThisDayData]);

  const displayError = errorMessage || authError || '';

  /* Discord callback handling */
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
      /* sessionStorage unavailable */
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
            /* keep default */
          }
          throw new Error(message);
        }

        const result = (await response.json()) as {
          jwt: string;
          csrfToken?: string;
        };
        if (!result.jwt)
          throw new Error('Discord sign-in did not return a token');

        if (result.csrfToken) storeCsrfToken(result.csrfToken);

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
              if (payload.exp)
                localStorage.setItem('ls_token_expiry', String(payload.exp));
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

  /* Google OAuth configure */
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

  /* Google One Tap */
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
      if (typeof sessionStorage !== 'undefined')
        sessionStorage.setItem(DISCORD_LOGIN_STATE_KEY, state);
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

  const googleDisabled = isLoading || isDiscordLoading || isConfiguring;
  const discordDisabled = isLoading || isDiscordLoading;

  return (
    <>
      <PageMeta
        title="Sign In — Legacy Sports"
        description="Sign in to Legacy Sports to access your fantasy baseball leagues, draft tools, and live stats."
      />

      <div className="ll-root" data-screen-label="Login">
        {/* ── Nav ── */}
        <header className="ll-nav">
          <nav aria-label="Landing" className="ll-nav-inner">
            <a className="ll-brand" href="/">
              <img
                src={`${import.meta.env.BASE_URL}logo.png`}
                alt="Legacy Sports"
              />
              <div className="ll-wordmark">
                LEGACY SPORTS
                <br />
                <span>FANTASY · YEAR-ROUND</span>
              </div>
            </a>
            <div className="ll-nav-right">
              <span className="ll-nav-meta">
                New to Legacy?{' '}
                <a href="/signup" className="ll-link-gold">
                  Create an account
                </a>
              </span>
            </div>
          </nav>
        </header>

        {/* ── Main ── */}
        <main className="ll-shell">
          {/* Left: Brand pane */}
          <section className="ll-cta-pane">
            <div className="ll-cta-inner">
              <div className="ll-eyebrow">
                <span className="ll-dot-gold" />
                Members Clubhouse
              </div>

              <h1 className="ll-h1">
                Take the field.
                <br />
                <span className="ll-h1-accent">Claim your dynasty.</span>
              </h1>

              <p className="ll-lede">
                Sign in to manage your rosters, draft legends across every era,
                and see how your lineup stacked up this week.
              </p>

              {/* Stat strip */}
              <div className="ll-stat-strip">
                <div className="ll-stat-cell">
                  <div className="ll-stat-num">1876</div>
                  <div className="ll-stat-lbl">First season on record</div>
                </div>
                <div className="ll-stat-divider" />
                <div className="ll-stat-cell">
                  <div className="ll-stat-num">{playerCountDisplay}</div>
                  <div className="ll-stat-lbl">Players across every era</div>
                </div>
                <div className="ll-stat-divider" />
                <div className="ll-stat-cell">
                  <div className="ll-stat-num ll-stat-num-gold">∞</div>
                  <div className="ll-stat-lbl">Year-round leagues</div>
                </div>
              </div>

              {/* On This Day marquee */}
              <div className="ll-marquee">
                <div className="ll-marquee-label">
                  On this day in baseball history
                </div>
                <div className="ll-marquee-row">
                  {marqueeEntries ? (
                    marqueeEntries.map((entry, idx) => (
                      <React.Fragment key={entry.name + idx.toString()}>
                        {idx > 0 && <span className="ll-mq-sep">·</span>}
                        <span className="ll-mq-team">
                          {entry.name}{' '}
                          {entry.score && (
                            <span className="ll-mq-score">{entry.score}</span>
                          )}{' '}
                          {entry.stat && (
                            <span className="ll-mq-stat">{entry.stat}</span>
                          )}
                        </span>
                      </React.Fragment>
                    ))
                  ) : (
                    <>
                      <span className="ll-mq-team">
                        RUTH <span className="ll-mq-score">3-5</span>{' '}
                        <span className="ll-mq-stat">2 HR · 5 RBI</span>
                      </span>
                      <span className="ll-mq-sep">·</span>
                      <span className="ll-mq-team">
                        MAYS <span className="ll-mq-score">2-4</span>{' '}
                        <span className="ll-mq-stat">2B · SB</span>
                      </span>
                      <span className="ll-mq-sep">·</span>
                      <span className="ll-mq-team">
                        GIBSON <span className="ll-mq-score">7 IP</span>{' '}
                        <span className="ll-mq-stat">9 K · 0 ER</span>
                      </span>
                      <span className="ll-mq-sep">·</span>
                      <span className="ll-mq-team">
                        TROUT <span className="ll-mq-score">1-3</span>{' '}
                        <span className="ll-mq-stat">BB · R</span>
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Right: Auth card */}
          <section className="ll-card-pane">
            <div className="ll-card">
              <div className="ll-card-head">
                <div className="ll-eyebrow ll-eyebrow-center">Sign In</div>
                <h2 className="ll-card-title">Step up to the plate</h2>
                <p className="ll-card-sub">
                  Use the account you already trust.
                </p>
              </div>

              <div className="ll-oauth-list">
                <button
                  type="button"
                  className="ll-oauth ll-oauth-google"
                  onClick={() => {
                    void handleSignIn();
                  }}
                  disabled={googleDisabled}
                  aria-label="Continue with Google"
                >
                  <span className="ll-oauth-icon">
                    <GoogleG />
                  </span>
                  <span className="ll-oauth-label">
                    {isLoading
                      ? 'Connecting to Google…'
                      : 'Continue with Google'}
                  </span>
                  {(isLoading || isConfiguring) && (
                    <span className="ll-spinner" aria-hidden="true" />
                  )}
                </button>

                {config.discordClientId ? (
                  <button
                    type="button"
                    className="ll-oauth ll-oauth-discord"
                    onClick={handleDiscordSignIn}
                    disabled={discordDisabled}
                    aria-label="Continue with Discord"
                  >
                    <span className="ll-oauth-icon">
                      <DiscordMark />
                    </span>
                    <span className="ll-oauth-label">
                      {isDiscordLoading
                        ? 'Connecting to Discord…'
                        : 'Continue with Discord'}
                    </span>
                    {isDiscordLoading && (
                      <span className="ll-spinner" aria-hidden="true" />
                    )}
                  </button>
                ) : null}
              </div>

              {displayError ? (
                <div className="ll-error" role="alert">
                  {displayError}
                </div>
              ) : null}

              <div className="ll-legal">
                By continuing, you agree to our{' '}
                <a href="/terms">Terms of Service</a> and{' '}
                <a href="/privacy">Privacy Policy</a>.
              </div>

              <div className="ll-get-started-row">
                <button
                  type="button"
                  className="ll-get-started"
                  onClick={() => {
                    void handleSignIn();
                  }}
                  disabled={googleDisabled}
                >
                  Get Started Free
                </button>
              </div>
            </div>

            <div className="ll-card-footer">
              <div className="ll-footer-item">
                <SecureIcon />
                <span>Trusted sign-in · Your account stays secure</span>
              </div>
              <div className="ll-footer-sep">·</div>
              <div className="ll-footer-item">
                <span>Free to play · No credit card</span>
              </div>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
