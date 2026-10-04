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
import {
  consumeSessionExpiredNotice,
  SESSION_EXPIRED_MESSAGE,
  useAuth,
} from '@legacy-sports/shared-components/auth';
import {
  isClientRejection,
  lastVisitedLeaguePath,
} from '@legacy-sports/shared-components/utils';
import { LoginPage as AuthCard } from '@legacy-sports/shared-components/auth';
import { BrandLogo } from '@legacy-sports/shared-components/ui';
import {
  useGetOnThisDayQuery,
  useGetPlayerCountQuery,
} from '@legacy-sports/graphql';
import { PageMeta } from '../../components/PageMeta';
import { storeCsrfToken } from '../../lib/csrf';
import { storeDiscordSessionPreCache } from '../../lib/session-precache';
import { getSafeRedirectTarget } from '../../lib/safe-redirect';
import { fullPageRedirect } from '../../lib/full-page-redirect';
import { consumeCameFrom, storeCameFrom } from '../../lib/came-from';
import { getLastVisitedLeague } from '../../lib/last-visited-league';
import { env } from '../../config/environment';
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

function DiscordGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.249a18.27 18.27 0 0 0-5.487 0 12.6 12.6 0 0 0-.617-1.25.077.077 0 0 0-.079-.036A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.2 14.2 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.331c-1.182 0-2.157-1.085-2.157-2.419 0-1.333.956-2.418 2.157-2.418 1.21 0 2.176 1.094 2.157 2.418 0 1.334-.956 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.418 2.157-2.418 1.21 0 2.176 1.094 2.157 2.418 0 1.334-.946 2.419-2.157 2.419z" />
    </svg>
  );
}

/* ── Helpers ── */

/**
 * Resolve the post-login redirect target. Precedence:
 *   1. An explicit deep-link the user came from before the Discord round-trip
 *      (LGN-037) — consumed here so it is used at most once.
 *   2. The user's last-opened league, for returning users (LS-6694).
 *   3. The generic app-root destination.
 * Always routed through getSafeRedirectTarget so a poisoned config value or a
 * tampered came-from entry can never turn this into an open redirect (LS-6691).
 */
function resolvePostLoginRedirect(): string {
  const cameFrom = consumeCameFrom();
  if (cameFrom) return getSafeRedirectTarget(cameFrom);
  const lastLeague = getLastVisitedLeague();
  const target = lastLeague ? lastVisitedLeaguePath(lastLeague) : env.baseUrl;
  return getSafeRedirectTarget(target);
}

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

/**
 * Translate an OAuth sign-in rejection into user-facing copy.
 *
 * Rejections from the Google Identity Services SDK (`OAuthProvider.signIn()`)
 * always carry a typed `OAuthErrorCode`, and their raw `error.message` values
 * read like developer diagnostics that can leak implementation details (e.g.
 * "NETWORK_ERROR: Failed to fetch from accounts.google.com"). For those we
 * switch on the code and return humanized copy — the raw SDK string is never
 * surfaced (LS-6683).
 *
 * Failures *without* an OAuth code are not SDK rejections: they come from the
 * downstream backend exchange (`loginWithOAuth` → the oauth-proxy) and already
 * carry intentional, user-facing copy ("Access denied: …", "Secure OAuth
 * failed: 504"). Those messages are preserved; only typed SDK codes are
 * rewritten. A generic line is used only when no usable message exists.
 */
function humanizeOAuthError(error: unknown): string {
  const code =
    error instanceof Error && 'code' in error
      ? (error as { code?: OAuthErrorCode }).code
      : undefined;

  switch (code) {
    case OAuthErrorCode.NETWORK_ERROR:
      return 'Could not reach Google — please check your connection and try again.';
    case OAuthErrorCode.CONFIGURATION_ERROR:
      return 'Sign-in is temporarily unavailable. Please try again in a moment.';
    case OAuthErrorCode.PLAY_SERVICES_NOT_AVAILABLE:
      return 'Google sign-in is unavailable on this device.';
    case OAuthErrorCode.IN_PROGRESS:
      return 'A sign-in is already in progress. Please wait a moment and try again.';
    case OAuthErrorCode.UNKNOWN_ERROR:
      return 'Sign-in failed. Please try again.';
    default:
      return error instanceof Error && error.message
        ? error.message
        : 'Sign-in failed. Please try again.';
  }
}

const DISCORD_SERVER_ERROR_MESSAGES: Record<string, string> = {
  exchange_failed: 'Discord sign-in failed. Please try again.',
  email_unverified:
    'Your Discord account does not have a verified email address.',
  invalid_state: 'Discord sign-in failed: invalid state. Please try again.',
};

/* ── Component ── */
export function LoginPage(): React.JSX.Element {
  const {
    config,
    login,
    loginWithOAuth,
    hydrateSession,
    clearError,
    error: authError,
  } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [isDiscordLoading, setIsDiscordLoading] = useState(false);
  // Synchronously detect the Discord OAuth callback on the very first render so
  // we can show a dedicated full-screen "Signing in with Discord…" progress
  // screen instead of flashing the regular login form (with a confusingly
  // disabled Discord button) while the code exchange runs (LGN-012 / LS-6667).
  // Initialised from window.location — NOT from an effect — so there is no
  // pre-paint frame where the login form is visible on slow networks.
  const [isDiscordCallback, setIsDiscordCallback] = useState(() => {
    if (typeof window === 'undefined') return false;
    if (!window.location.pathname.endsWith('/auth/discord/callback'))
      return false;
    const params = new URLSearchParams(window.location.search);
    // Only show progress when there are params we can actually exchange and no
    // OAuth error — the error / invalid-state paths fall through to the normal
    // form so the user sees the message and can retry.
    return Boolean(
      params.get('code') && params.get('state') && !params.get('error'),
    );
  });
  const [isConfigured, setIsConfigured] = useState(false);
  const [isConfiguring, setIsConfiguring] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  // Explain an involuntary sign-out (LS-10447): the AuthProvider arms this
  // one-shot notice when the server rejects a session refresh. The URL is left
  // untouched on logout, so signing back in lands on the same page.
  useEffect(() => {
    if (consumeSessionExpiredNotice()) setErrorMessage(SESSION_EXPIRED_MESSAGE);
  }, []);

  // Synchronous re-entrancy latch for handleSignIn. `isLoading` is React state
  // and is not committed until after the current synchronous task finishes, so a
  // rapid double-tap can fire two click handlers that both pass an `isLoading`
  // guard before the first setIsLoading(true) commits. This ref is read and set
  // synchronously, so the second invocation sees the latch and bails out.
  const signInInFlightRef = useRef(false);
  // Same synchronous re-entrancy latch for the email/password Sign In button —
  // `isEmailLoading` is React state and is not committed until the current
  // synchronous task finishes, so a rapid double-submit could fire two login()
  // calls before the first setIsEmailLoading(true) commits. This ref guards the
  // window the state flag cannot (mirrors signInInFlightRef for the Google path).
  const emailSignInInFlightRef = useRef(false);

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

  // Clear both error sources so the banner fully dismisses — displayError falls
  // back to authError, so clearing only the local message would leave an
  // auth-originated error visible (LGN-027).
  const handleDismissError = useCallback(() => {
    setErrorMessage('');
    clearError();
  }, [clearError]);

  /* Discord callback handling */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.location.pathname.endsWith('/auth/discord/callback')) return;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');

    if (error) {
      // Only Discord's `access_denied` is a genuine user cancellation or denial
      // of consent. The other OAuth error codes (invalid_request, server_error,
      // temporarily_unavailable, and any unrecognized value) are Discord-side or
      // request faults — surface a neutral "try again" message instead of
      // blaming the user for them (LS-6664).
      setErrorMessage(
        error === 'access_denied'
          ? 'Discord sign-in was cancelled or denied.'
          : 'Discord is having trouble. Please try again.',
      );
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
    clearError();

    const exchangeCode = async () => {
      try {
        // Read the proxy URL inside the try so a synchronous fault (e.g. a
        // getter throwing from a hot-swapped config) is still caught and the
        // `finally` below resets the loading state — otherwise the Discord
        // button would stay disabled forever (LS-6687).
        //
        // LGN-010 (LS-6665): never fall back to an `http://localhost:5001`
        // proxy. If `oauthProxyUrl` were ever undefined in production (e.g. an
        // environment-config bug), that fallback would POST the OAuth code over
        // plaintext http, opening a MITM path to plant a forged JWT whose
        // unverified payload claims the UI then trusts (accessLevel gating).
        // Hard-fail instead — this mirrors the guard already in
        // handleDiscordSignIn, which refuses to start the flow without a proxy.
        const oauthProxyUrl = config.oauthProxyUrl;
        if (!oauthProxyUrl) {
          throw new Error('Discord sign-in is not configured.');
        }

        const response = await fetch(`${oauthProxyUrl}/discord`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ code, state }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          let message = 'Discord sign-in failed. Please try again.';
          try {
            const errorData = JSON.parse(errorText) as { code?: string };
            if (
              errorData.code &&
              errorData.code in DISCORD_SERVER_ERROR_MESSAGES
            ) {
              message = DISCORD_SERVER_ERROR_MESSAGES[errorData.code]!;
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
        // Destination precedence (resolvePostLoginRedirect): the deep-link the
        // user came from before the Discord round-trip (e.g. /league/123,
        // LGN-037) → the user's last-opened league (LS-6694) → the app base URL.
        // The candidate is routed through getSafeRedirectTarget so a poisoned
        // config value or a tampered came-from entry can never turn this into an
        // open redirect, whether we SPA-navigate or fall back to a full reload
        // (LS-6691).
        const safeTarget = resolvePostLoginRedirect();
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
          fullPageRedirect(safeTarget);
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
        // Drop out of the full-screen progress state back to the normal login
        // form so the error banner is visible and the user can retry (LS-6667).
        setIsDiscordCallback(false);
      } finally {
        setIsDiscordLoading(false);
      }
    };

    void exchangeCode();
  }, [config.oauthProxyUrl, clearError, hydrateSession]);

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
      // Capture the deep-link before auth so resolvePostLoginRedirect returns
      // the user to the page they were trying to reach (LS-7523). storeCameFrom
      // is a no-op on non-meaningful paths (root, /login) so this is safe for
      // all callers.
      storeCameFrom();
      setIsLoading(true);
      setErrorMessage('');
      clearError();
      try {
        await loginWithOAuth(customEvent.detail.authResponse);
        // Redirect to the deep-link the user came from, their last-opened
        // league, or the app root (resolvePostLoginRedirect precedence). The
        // auth-guard swaps in the Router after the auth state flips; rewriting
        // the URL here (before that re-render commits) makes the Router mount
        // on the target route. LoginPage renders outside the Router, so
        // navigate() is not available — replaceState mirrors the Discord
        // callback path (LS-6694).
        if (typeof window !== 'undefined') {
          window.history.replaceState(null, '', resolvePostLoginRedirect());
        }
      } catch (error) {
        LOGGER.error(
          'One Tap authentication failed on login page:',
          error instanceof Error ? error : new Error(String(error)),
        );
        setErrorMessage(humanizeOAuthError(error));
      } finally {
        setIsLoading(false);
      }
    };
    const wrapper = (event: Event) => {
      void handleOneTapSuccess(event);
    };
    window.addEventListener('gsi-one-tap-success', wrapper);
    return () => window.removeEventListener('gsi-one-tap-success', wrapper);
  }, [loginWithOAuth, clearError]);

  const handleSignIn = useCallback(async () => {
    if (!isConfigured || isConfiguring || signInInFlightRef.current) return;
    signInInFlightRef.current = true;
    // Capture the deep-link before the popup opens so resolvePostLoginRedirect
    // can return the user here after auth (LS-7520). storeCameFrom is a no-op
    // on non-meaningful paths (root, /login) so this is safe for all callers.
    storeCameFrom();
    setIsLoading(true);
    setErrorMessage('');
    clearError();
    try {
      const oauthResponse = await OAuthProvider.signIn();
      await loginWithOAuth(oauthResponse);
      // Redirect returning users to their last-opened league (LS-6694). See the
      // One Tap handler above for why replaceState is used here.
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', resolvePostLoginRedirect());
      }
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
          error instanceof Error ? error : new Error(String(error)),
        );
        setErrorMessage(humanizeOAuthError(error));
      }
    } finally {
      signInInFlightRef.current = false;
      setIsLoading(false);
    }
  }, [isConfigured, isConfiguring, loginWithOAuth, clearError]);

  // Email/password sign-in (LGN-017). The full chain already exists end-to-end
  // (useAuth().login → AuthService.authenticateWithEmail → POST /oauth/login);
  // this only surfaces it in the UI. On success, login() flips the auth state
  // and the auth guard swaps in the authenticated app — no navigation needed
  // here, mirroring the Google handleSignIn path.
  const handleEmailPasswordSignIn = useCallback(
    async (email: string, password: string) => {
      if (isEmailLoading || emailSignInInFlightRef.current) return;
      emailSignInInFlightRef.current = true;
      setIsEmailLoading(true);
      setErrorMessage('');
      try {
        await login(email, password);
      } catch (error) {
        // A 4xx (wrong password, unknown email, …) is a routine, expected
        // user outcome, not an application error — log it at `warn` so it
        // doesn't get reported to Rollbar as an error (LS-9751). Anything
        // else (network failure, 5xx) is unexpected and stays at `error`.
        const status = (error as { status?: number } | undefined)?.status;
        const logArgs = [
          'Email/password sign-in failed on login page:',
          error instanceof Error ? error : String(error),
        ] as const;
        if (isClientRejection(status)) {
          LOGGER.warn(...logArgs);
        } else {
          LOGGER.error(...logArgs);
        }
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Sign-in failed. Please try again.',
        );
      } finally {
        emailSignInInFlightRef.current = false;
        setIsEmailLoading(false);
      }
    },
    [isEmailLoading, login],
  );

  const handleDiscordSignIn = useCallback(() => {
    const oauthProxyUrl = config.oauthProxyUrl;
    if (!oauthProxyUrl) return;
    // Stash the deep-link the user is on before the browser leaves for Discord,
    // so the callback handler can return them here instead of the app root
    // (LGN-037).
    storeCameFrom();
    window.location.href = `${oauthProxyUrl}/discord/authorize`;
  }, [config.oauthProxyUrl]);

  // While the Discord OAuth callback is being exchanged, replace the entire
  // login form with a dedicated progress screen — this hides the Google/Discord
  // buttons during the exchange (LGN-012 / LS-6667) rather than dimming one
  // button on the otherwise-interactive form.
  if (isDiscordCallback) {
    return (
      <>
        <PageMeta
          title="Signing in — Legacy Sports"
          description="Completing your Discord sign-in to Legacy Sports."
        />

        <div className="ll-root" data-screen-label="Discord Callback">
          <header className="ll-nav">
            <nav aria-label="Landing" className="ll-nav-inner">
              <a className="ll-brand" href="/">
                <BrandLogo
                  src={`${env.baseUrl}logo.png`}
                  tagline="FANTASY · YEAR-ROUND"
                  alt="Legacy Sports"
                />
              </a>
            </nav>
          </header>

          <main
            className="ll-callback"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <div className="ll-callback-inner">
              <div className="ll-callback-badge">
                <span className="ll-callback-disc">
                  <DiscordGlyph />
                </span>
                <span className="ll-callback-spinner" aria-hidden="true" />
              </div>
              <h1 className="ll-callback-title">Signing in with Discord…</h1>
              <p className="ll-callback-sub">
                Hang tight — we&rsquo;re setting your lineup.
              </p>
            </div>
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

      <div className="ll-root" data-screen-label="Login">
        {/* ── Nav ── */}
        <header className="ll-nav">
          <nav aria-label="Landing" className="ll-nav-inner">
            <a className="ll-brand" href="/">
              <BrandLogo
                src={`${env.baseUrl}logo.png`}
                tagline="FANTASY · YEAR-ROUND"
                alt="Legacy Sports"
              />
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
              termsUrl="/terms"
              privacyUrl="/privacy"
              onGoogleSignIn={() => {
                void handleSignIn();
              }}
              onEmailPasswordSignIn={(email, password) => {
                void handleEmailPasswordSignIn(email, password);
              }}
              onDiscordSignIn={
                config.discordClientId ? handleDiscordSignIn : undefined
              }
              onForgotPassword={
                config.oauthProxyUrl
                  ? () => {
                      window.open(
                        `${config.oauthProxyUrl}/forgot-password`,
                        '_blank',
                        'noopener,noreferrer',
                      );
                    }
                  : undefined
              }
              isEmailPasswordLoading={isEmailLoading}
              isGoogleLoading={isLoading}
              isDiscordLoading={isDiscordLoading}
              isConfiguring={isConfiguring}
              errorMessage={displayError || undefined}
              onDismissError={handleDismissError}
            />

            {/* LGN-024: account-recovery affordance for users who can't sign in
                via OAuth or the email/password form. */}
            <p className="ll-card-recovery">
              Trouble signing in?{' '}
              <a
                className="ll-link-gold"
                href="mailto:support@legacysports.com?subject=Trouble%20signing%20in"
              >
                Get help accessing your account
              </a>
            </p>

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
