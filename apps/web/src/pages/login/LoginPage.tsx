import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { LOGGER } from '@legacy-sports/logging';
import {
  OAuthErrorCode,
  OAuthProvider,
} from '@legacy-sports/shared-components/ui';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { LoginPage as AuthCard } from '@legacy-sports/shared-components';
import { PageMeta } from '../../components/PageMeta';
import { storeCsrfToken } from '../../lib/csrf';
import { storeDiscordSessionPreCache } from '../../lib/session-precache';
import { getSafeRedirectTarget } from '../../lib/safe-redirect';
import { env } from '../../config/environment';
import {
  useGetOnThisDayQuery,
  useGetPlayerCountQuery,
} from '../../api/db/graphql.generated';
import './LoginPage.css';

/* ── Icons ── */

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
  const {
    config,
    loginWithOAuth,
    hydrateSession,
    error: authError,
  } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isDiscordLoading, setIsDiscordLoading] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [isConfiguring, setIsConfiguring] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  // Synchronous re-entrancy latch for handleSignIn. `isLoading` is React state
  // and is not committed until after the current synchronous task finishes, so a
  // rapid double-tap can fire two click handlers that both pass an `isLoading`
  // guard before the first setIsLoading(true) commits. This ref is read and set
  // synchronously, so the second invocation sees the latch and bails out.
  const signInInFlightRef = useRef(false);

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

    if (!code || !state) {
      setErrorMessage(
        'Discord sign-in failed: invalid state. Please try again.',
      );
      return;
    }

    setIsDiscordLoading(true);
    setErrorMessage('');

    const exchangeCode = async () => {
      try {
        // Read the proxy URL inside the try so a synchronous fault (e.g. a
        // getter throwing from a hot-swapped config) is still caught and the
        // `finally` below resets the loading state — otherwise the Discord
        // button would stay disabled forever (LS-6687).
        const oauthProxyUrl = config.oauthProxyUrl ?? 'http://localhost:5001';

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

        // Flip the auth state in-memory and SPA-navigate home instead of doing
        // a full `window.location.replace` page reload, which would re-boot the
        // entire app and re-fetch every cached query (~1-2s of perceived
        // latency, LS-6693).  LoginPage renders outside the Router (it is the
        // auth-guard's login screen), so react-router's navigate() is not
        // available here — instead hydrateSession() updates AuthProvider in
        // place (the guard then swaps in the authenticated app).  The callback
        // URL is rewritten to the app root *before* that swap so the Router
        // mounts on the home route rather than the Discord-link callback route.
        //
        // The redirect target is still routed through getSafeRedirectTarget so
        // a poisoned config value can never turn this into an open redirect,
        // whether we SPA-navigate or fall back to a full reload (LS-6691).
        const safeTarget = getSafeRedirectTarget(env.baseUrl);
        const hydrated = hydrateSession(result.jwt);
        if (hydrated) {
          window.history.replaceState(null, '', safeTarget);
        } else {
          // Decode failed — fall back to the pre-cache + full reload path so the
          // session is still restored via the HttpOnly cookie on next load.
          // The cache is always cleared on logout via AuthService.clearTokens()
          // and re-verified by the background JWT refresh.  See
          // lib/session-precache.ts.
          storeDiscordSessionPreCache(result.jwt);
          window.location.replace(safeTarget);
        }
      } catch (err) {
        LOGGER.error(
          'Discord callback exchange failed:',
          err instanceof Error ? err : String(err),
        );
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
        LOGGER.warn(
          'Failed to configure OAuth on login page:',
          error instanceof Error ? error : String(error),
        );
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
          error instanceof Error ? error : new Error(String(error)),
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
    if (!isConfigured || isConfiguring || signInInFlightRef.current) return;
    signInInFlightRef.current = true;
    setIsLoading(true);
    setErrorMessage('');
    try {
      const oauthResponse = await OAuthProvider.signIn();
      await loginWithOAuth(oauthResponse);
    } catch (error) {
      const isCancelled =
        error instanceof Error &&
        'code' in error &&
        (error as { code: OAuthErrorCode }).code ===
          OAuthErrorCode.SIGN_IN_CANCELLED;
      if (isCancelled) {
        LOGGER.debug('Google sign-in popup closed by user');
      } else {
        LOGGER.error(
          'Sign-in failed on login page:',
          error instanceof Error ? error : String(error),
        );
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Sign-in failed. Please try again.',
        );
      }
    } finally {
      signInInFlightRef.current = false;
      setIsLoading(false);
    }
  }, [isConfigured, isConfiguring, loginWithOAuth]);

  const handleDiscordSignIn = useCallback(() => {
    const oauthProxyUrl = config.oauthProxyUrl;
    if (!oauthProxyUrl) return;
    window.location.href = `${oauthProxyUrl}/discord/authorize`;
  }, [config.oauthProxyUrl]);

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
              <img src={`${env.baseUrl}logo.png`} alt="Legacy Sports" />
              <div className="ll-wordmark">
                LEGACY SPORTS
                <br />
                <span>FANTASY · YEAR-ROUND</span>
              </div>
            </a>
            <div className="ll-nav-right">
              <span className="ll-nav-meta">
                New to Legacy?{' '}
                {/* LS-6689: the app is OAuth-only — there is no /signup route or
                    email registration. Point users to the OAuth card on this
                    page instead of a dead link that implied email signup. */}
                <a href="#ll-signup-card" className="ll-link-gold">
                  {config.discordClientId
                    ? 'Sign up with Google or Discord'
                    : 'Sign up with Google'}
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
          <section className="ll-card-pane" id="ll-signup-card">
            <AuthCard
              onGoogleSignIn={() => {
                void handleSignIn();
              }}
              onDiscordSignIn={
                config.discordClientId ? handleDiscordSignIn : undefined
              }
              isGoogleLoading={isLoading}
              isDiscordLoading={isDiscordLoading}
              isConfiguring={isConfiguring}
              errorMessage={displayError || undefined}
            />

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
