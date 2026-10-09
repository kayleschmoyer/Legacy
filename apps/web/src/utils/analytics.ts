/**
 * Google Analytics 4 (GA4) tracking utility
 *
 * This module provides a type-safe wrapper around Google Analytics gtag.js
 * for tracking page views and custom events throughout the application.
 */

import { LOGGER } from '@legacy-sports/logging';
import { getEnvironmentConfig } from '../config/environment';
import { hasAnalyticsConsent, subscribeConsent } from '../consent/consentStore';

// Internal state — updated by setUserProperties(); auto-included in all events
let _subscriptionTier: 'free' | 'premium' | undefined;

declare global {
  interface Window {
    gtag?: (
      command: 'config' | 'consent' | 'event' | 'set',
      targetId: string,
      config?: Record<string, unknown>,
    ) => void;
    dataLayer?: unknown[];
  }
}

export interface AnalyticsEvent {
  category?: string;
  label?: string;
  value?: number;
  [key: string]: string | number | boolean | undefined;
}

/**
 * Google Consent Mode v2 ad signals (LS-10764). We run no advertising, so
 * these are always denied and never offered as a choice.
 */
const AD_SIGNALS_DENIED = {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
} as const;

let _scriptLoaded = false;
let _appliedConsent: boolean | undefined;

/**
 * True when an event may be sent: GA is configured, gtag exists, and the
 * visitor's analytics consent is granted. Events are dropped (not queued)
 * without consent, so nothing collected before a choice is sent afterwards.
 */
function canTrack(): boolean {
  const env = getEnvironmentConfig();
  return Boolean(
    window.gtag && env.googleAnalyticsMeasurementId && hasAnalyticsConsent(),
  );
}

function loadGtagScript(measurementId: string): void {
  if (_scriptLoaded) return;
  _scriptLoaded = true;
  // `crossorigin` lets the browser report full exception details
  // (message/filename/lineno) for errors thrown inside this cross-origin
  // script instead of masking them as an opaque "Script error." with no
  // `error` object — which is what led Rollbar's automatic uncaught-exception
  // capture to log an untitled "(unknown)" item for a gtag.js-internal error
  // (LS-9170).
  const script = document.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);
}

/** Expire GA's first-party cookies on this host and its parent domains. */
function clearGaCookies(): void {
  const names = document.cookie
    .split(';')
    .map((part) => part.split('=')[0].trim())
    .filter((name) => /^_ga($|_)|^_gid$|^_gat($|_)/.test(name));
  if (names.length === 0) return;

  const labels = window.location.hostname.split('.');
  const domains: (string | undefined)[] = [undefined];
  for (let i = 0; i < labels.length - 1; i++) {
    domains.push(`.${labels.slice(i).join('.')}`);
  }
  for (const name of names) {
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ''}`;
    }
  }
}

/**
 * Bring GA in line with the current consent: on grant, tell Consent Mode and
 * load gtag.js (first time only); on withdrawal, tell Consent Mode and expire
 * GA cookies. gtag.js is never requested while consent is denied.
 */
function applyAnalyticsConsent(measurementId: string): void {
  const granted = hasAnalyticsConsent();
  if (granted === _appliedConsent) return;
  const isInitial = _appliedConsent === undefined;
  _appliedConsent = granted;

  if (!isInitial) {
    window.gtag?.('consent', 'update', {
      analytics_storage: granted ? 'granted' : 'denied',
    });
  }
  if (granted) {
    loadGtagScript(measurementId);
  } else if (!isInitial) {
    clearGaCookies();
  }
}

/**
 * Initialize Google Analytics 4
 * Call this once when the app starts
 */
export function initializeAnalytics(): void {
  const env = getEnvironmentConfig();
  const measurementId = env.googleAnalyticsMeasurementId;

  // Only initialize in production with valid measurement ID
  if (!measurementId || env.isDev) {
    LOGGER.info('[Analytics] Skipped initialization (dev mode or no ID)');
    return;
  }

  // Initialize dataLayer and gtag function
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params -- GA4 gtag requires arguments object
    window.dataLayer?.push(arguments);
  };

  // Consent Mode v2 defaults must be queued before `config` (LS-10764).
  window.gtag('consent', 'default', {
    ...AD_SIGNALS_DENIED,
    analytics_storage: hasAnalyticsConsent() ? 'granted' : 'denied',
  });

  // Configure GA4
  window.gtag('config', measurementId, {
    send_page_view: false, // We'll manually track page views
    cookie_flags: 'SameSite=None;Secure',
  });

  applyAnalyticsConsent(measurementId);
  subscribeConsent(() => applyAnalyticsConsent(measurementId));

  LOGGER.info('[Analytics] Google Analytics initialized:', measurementId);
}

/**
 * Track a page view
 * @param path - The page path (e.g., '/league/123')
 * @param title - Optional page title
 */
export function trackPageView(path: string, title?: string): void {
  if (!canTrack()) return;

  window.gtag?.('event', 'page_view', {
    page_path: path,
    page_title: title || document.title,
  });

  LOGGER.info('[Analytics] Page view tracked:', path);
}

/**
 * Track a custom event
 * @param eventName - Name of the event (e.g., 'button_click', 'form_submit')
 * @param params - Event parameters
 */
export function trackEvent(eventName: string, params?: AnalyticsEvent): void {
  if (!canTrack()) return;

  window.gtag?.('event', eventName, {
    subscription_tier: _subscriptionTier,
    ...params,
  });

  LOGGER.info('[Analytics] Event tracked:', eventName, params);
}

/**
 * Track user login
 * @param method - Login method (e.g., 'google', 'email')
 */
export function trackLogin(method: string): void {
  trackEvent('login', { method });
}

/**
 * Track user signup
 * @param method - Signup method (e.g., 'google', 'email')
 */
export function trackSignup(method: string): void {
  trackEvent('sign_up', { method });
}

/**
 * Track a user-initiated sign-out (LS-7224). Sign-out spikes are a churn /
 * bad-deploy signal. GA4 event names only allow letters, digits and
 * underscores, so this is `sign_out` rather than a dotted `profile.sign_out`;
 * GA stamps the event time itself.
 * @param source - Where the user signed out from (e.g., 'profile_settings')
 */
export function trackSignOut(source: string): void {
  trackEvent('sign_out', { source, category: 'auth' });
}

/** How the user left the onboarding tutorial without finishing it. */
export type OnboardingSkipMethod =
  | 'close_button'
  | 'skip_button'
  | 'backdrop'
  | 'escape';

/**
 * Onboarding tutorial funnel (LS-6903). Event names are GA4-safe
 * (letters, digits, underscores) and carry no PII.
 */
export function trackOnboardingStarted(): void {
  trackEvent('onboarding_started', { category: 'onboarding' });
}

/**
 * @param stepId - Stable id of the step shown (e.g., 'get-started')
 * @param stepIndex - Zero-based position of the step
 */
export function trackOnboardingStepViewed(
  stepId: string,
  stepIndex: number,
): void {
  trackEvent('onboarding_step_viewed', {
    category: 'onboarding',
    step_id: stepId,
    step_index: stepIndex,
  });
}

/**
 * @param fromStep - Id of the step the user was on when they left
 * @param method - What they used to leave
 */
export function trackOnboardingSkipped(
  fromStep: string,
  method: OnboardingSkipMethod,
): void {
  trackEvent('onboarding_skipped', {
    category: 'onboarding',
    from_step: fromStep,
    method,
  });
}

export function trackOnboardingCompleted(): void {
  trackEvent('onboarding_completed', { category: 'onboarding' });
}

/** Premium upsell card at the end of onboarding (LS-6912). */
export function trackOnboardingUpsellShown(): void {
  trackEvent('onboarding_upsell_shown', { category: 'onboarding' });
}

export function trackOnboardingUpsellClicked(): void {
  trackEvent('onboarding_upsell_clicked', { category: 'onboarding' });
}

export function trackOnboardingUpsellDismissed(): void {
  trackEvent('onboarding_upsell_dismissed', { category: 'onboarding' });
}

/**
 * Track player selection
 * @param playerId - The selected player ID
 * @param position - Player position
 */
export function trackPlayerSelected(playerId: number, position: string): void {
  trackEvent('player_selected', {
    player_id: playerId,
    position,
    category: 'roster',
  });
}

const TEAM_VIEWED_DEDUPE_KEY_PREFIX = 'analytics:team_viewed:';
const TEAM_VIEWED_DEDUPE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * True when a `team_viewed` event for this (teamId, leagueId) tuple was
 * already fired within the de-dupe window, and records this firing when it
 * wasn't. Uses `sessionStorage` so the de-dupe survives unmount/remount from
 * back-forward navigation, not just re-renders (LS-6050).
 */
function isTeamViewedDeduped(teamId: number, leagueId: number): boolean {
  try {
    if (typeof sessionStorage === 'undefined') return false;
    const key = `${TEAM_VIEWED_DEDUPE_KEY_PREFIX}${teamId}:${leagueId}`;
    const lastTracked = Number(sessionStorage.getItem(key));
    if (
      lastTracked &&
      Date.now() - lastTracked < TEAM_VIEWED_DEDUPE_WINDOW_MS
    ) {
      return true;
    }
    sessionStorage.setItem(key, String(Date.now()));
    return false;
  } catch {
    // sessionStorage can throw in private-browsing / quota-exceeded modes.
    // De-duping is best-effort, so fall back to always tracking.
    return false;
  }
}

/**
 * Track team roster view. De-duped to fire once per (teamId, leagueId) tuple
 * per 5-minute window, so navigating back and forth between teams doesn't
 * inflate the view count (LS-6050).
 * @param teamId - The team ID
 * @param leagueId - The league ID
 */
export function trackTeamViewed(teamId: number, leagueId: number): void {
  if (isTeamViewedDeduped(teamId, leagueId)) return;

  trackEvent('team_viewed', {
    team_id: teamId,
    league_id: leagueId,
    category: 'team',
  });
}

/**
 * Set user ID for analytics
 * @param userId - The user ID
 */
export function setUserId(userId: string | number): void {
  const env = getEnvironmentConfig();

  if (!canTrack() || !env.googleAnalyticsMeasurementId) {
    return;
  }

  window.gtag?.('set', env.googleAnalyticsMeasurementId, {
    user_id: String(userId),
  });

  LOGGER.info('[Analytics] User ID set:', userId);
}

/**
 * Set user properties for segmentation and analysis
 * @param properties - User properties to set
 */
export function setUserProperties(properties: {
  userId?: string | number;
  userType?: 'commissioner' | 'league_member' | 'free_agent';
  totalLeagues?: number;
  primarySport?: 'baseball' | 'football';
  accountAge?: 'new' | 'returning' | 'veteran'; // <7 days, <30 days, 30+ days
  subscriptionTier?: 'free' | 'premium';
}): void {
  if (!canTrack()) return;

  window.gtag?.('set', 'user_properties', {
    user_type: properties.userType,
    total_leagues: properties.totalLeagues,
    primary_sport: properties.primarySport,
    account_age: properties.accountAge,
    subscription_tier: properties.subscriptionTier,
  });

  if (properties.subscriptionTier !== undefined) {
    _subscriptionTier = properties.subscriptionTier;
  }

  if (properties.userId) {
    setUserId(properties.userId);
  }

  LOGGER.info('[Analytics] User properties set:', properties);
}

// =============================================================================
// Roster Management Events
// =============================================================================

/**
 * Track roster management actions
 * @param action - Type of roster action
 * @param details - Action details
 */
export function trackRosterAction(
  action: 'add' | 'drop' | 'trade' | 'position_change',
  details: {
    leagueId: number;
    playerId?: number;
    fromPosition?: string;
    toPosition?: string;
  },
): void {
  trackEvent('roster_action', {
    action,
    league_id: details.leagueId,
    player_id: details.playerId,
    from_position: details.fromPosition,
    to_position: details.toPosition,
    category: 'roster',
  });
}

// =============================================================================
// Matchup & Analytics Events
// =============================================================================

/**
 * Track matchup views
 * @param matchupId - The matchup ID
 * @param leagueId - The league ID
 * @param weekNumber - The week number
 */
export function trackMatchupViewed(
  matchupId: number,
  leagueId: number,
  weekNumber: number,
): void {
  trackEvent('matchup_viewed', {
    matchup_id: matchupId,
    league_id: leagueId,
    week_number: weekNumber,
    category: 'matchup',
  });
}

// =============================================================================
// Monetization & Premium Features
// =============================================================================

/**
 * Track premium feature interest/clicks
 * @param featureName - Name of the premium feature
 */
export function trackPremiumFeatureClick(featureName: string): void {
  trackEvent('premium_feature_click', {
    feature_name: featureName,
    category: 'monetization',
  });
}

/**
 * Track when a premium gate is shown (user hit a paywall)
 * @param featureName - Name of the blocked feature
 */
export function trackPremiumFeatureBlocked(featureName: string): void {
  trackEvent('premium_feature_blocked', {
    feature_name: featureName,
    category: 'monetization',
  });
}

/**
 * Track when a feature-flag kill-switch redirects the user away from a
 * gated route (e.g. GrowthBook's `football_enabled` flag forcing
 * FootballGate to redirect to `/`). Makes a rollout kill-switch flip
 * visible in GA4 instead of a silent, unmonitored bounce.
 * @param featureName - GrowthBook feature flag key that triggered the redirect
 */
export function trackFeatureGateBlocked(featureName: string): void {
  trackEvent('feature_gate_blocked', {
    feature_name: featureName,
    category: 'feature_flag',
  });
}

// =============================================================================
// League Creation
// =============================================================================

/**
 * Track Fast Lane toggle usage on the league-create form (LS-9179).
 * @param enabled - Whether Fast Lane was switched on or off
 * @param sport - The sport of the league being created
 */
export function trackFastLaneToggled(
  enabled: boolean,
  sport: 'baseball' | 'football',
): void {
  trackEvent('fast_lane_toggled', {
    enabled,
    sport,
    category: 'league_creation',
  });
}

/**
 * Track a league created with Fast Lane enabled (LS-9179) — the adoption
 * signal that matters more than the toggle event, since a user can flip Fast
 * Lane on and still back out before submitting.
 * @param sport - The sport of the league being created
 */
export function trackFastLaneLeagueCreated(
  sport: 'baseball' | 'football',
): void {
  trackEvent('fast_lane_league_created', {
    sport,
    category: 'league_creation',
  });
}

/**
 * Track subscription started
 * @param tier - Subscription tier
 */
export function trackSubscriptionStarted(tier: 'premium'): void {
  trackEvent('subscription_started', {
    tier,
    category: 'monetization',
  });
}

/**
 * Track subscription cancelled
 * @param tier - Subscription tier that was cancelled
 */
export function trackSubscriptionCancelled(tier: 'premium'): void {
  trackEvent('subscription_cancelled', {
    tier,
    category: 'monetization',
  });
}

/**
 * Track subscription renewed
 * @param tier - Subscription tier that was renewed
 */
export function trackSubscriptionRenewed(tier: 'premium'): void {
  trackEvent('subscription_renewed', {
    tier,
    category: 'monetization',
  });
}

/**
 * Track checkout initiation — GA4 standard e-commerce event.
 * Fire when the user clicks Upgrade and before redirecting to Stripe.
 * @param billingCycle - 'monthly' | 'annual'
 * @param value - Purchase value in USD
 */
export function trackBeginCheckout(
  billingCycle: 'monthly' | 'annual',
  value: number,
): void {
  if (!canTrack()) return;
  window.gtag?.('event', 'begin_checkout', {
    currency: 'USD',
    value,
    items: [
      {
        item_id: `premium_${billingCycle}`,
        item_name: 'Premium Subscription',
        price: value,
        quantity: 1,
      },
    ],
  });
  LOGGER.info('[Analytics] begin_checkout tracked:', billingCycle);
}
