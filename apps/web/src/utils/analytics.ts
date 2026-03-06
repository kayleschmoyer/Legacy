/**
 * Google Analytics 4 (GA4) tracking utility
 *
 * This module provides a type-safe wrapper around Google Analytics gtag.js
 * for tracking page views and custom events throughout the application.
 */

import { LOGGER } from '@legacy-sports/logging';
import { getEnvironmentConfig } from '../config/environment';

declare global {
  interface Window {
    gtag?: (
      command: 'config' | 'event' | 'set',
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

  // Load gtag.js script
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);

  // Initialize dataLayer and gtag function
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params -- GA4 gtag requires arguments object
    window.dataLayer?.push(arguments);
  };

  // Configure GA4
  window.gtag('config', measurementId, {
    send_page_view: false, // We'll manually track page views
    cookie_flags: 'SameSite=None;Secure',
  });

  LOGGER.info('[Analytics] Google Analytics initialized:', measurementId);
}

/**
 * Track a page view
 * @param path - The page path (e.g., '/league/123')
 * @param title - Optional page title
 */
export function trackPageView(path: string, title?: string): void {
  const env = getEnvironmentConfig();

  if (!window.gtag || !env.googleAnalyticsMeasurementId) {
    return;
  }

  window.gtag('event', 'page_view', {
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
  const env = getEnvironmentConfig();

  if (!window.gtag || !env.googleAnalyticsMeasurementId) {
    return;
  }

  window.gtag('event', eventName, params);

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
 * Track league creation
 * @param leagueId - The created league ID
 */
export function trackLeagueCreated(leagueId: number): void {
  trackEvent('league_created', {
    league_id: leagueId,
    category: 'league',
  });
}

/**
 * Track draft start
 * @param leagueId - The league ID
 * @param draftType - Type of draft (e.g., 'random', 'snake')
 */
export function trackDraftStarted(leagueId: number, draftType: string): void {
  trackEvent('draft_started', {
    league_id: leagueId,
    draft_type: draftType,
    category: 'draft',
  });
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

/**
 * Track team roster view
 * @param teamId - The team ID
 * @param leagueId - The league ID
 */
export function trackTeamViewed(teamId: number, leagueId: number): void {
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

  if (!window.gtag || !env.googleAnalyticsMeasurementId) {
    return;
  }

  window.gtag('set', env.googleAnalyticsMeasurementId, {
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
  const env = getEnvironmentConfig();

  if (!window.gtag || !env.googleAnalyticsMeasurementId) {
    return;
  }

  window.gtag('set', 'user_properties', {
    user_type: properties.userType,
    total_leagues: properties.totalLeagues,
    primary_sport: properties.primarySport,
    account_age: properties.accountAge,
    subscription_tier: properties.subscriptionTier,
  });

  if (properties.userId) {
    setUserId(properties.userId);
  }

  LOGGER.info('[Analytics] User properties set:', properties);
}

// =============================================================================
// League Events
// =============================================================================

/**
 * Track league join
 * @param leagueId - The league ID
 * @param method - How the user joined
 */
export function trackLeagueJoined(
  leagueId: number,
  method: 'invite_code' | 'direct_link',
): void {
  trackEvent('league_joined', {
    league_id: leagueId,
    join_method: method,
    category: 'league',
  });
}

/**
 * Track league settings configuration
 * @param config - League configuration details
 */
export function trackLeagueConfigured(config: {
  leagueId: number;
  maxRosterSize: number;
  scoringType: string;
  draftType: string;
  teamCount: number;
}): void {
  trackEvent('league_configured', {
    league_id: config.leagueId,
    max_roster_size: config.maxRosterSize,
    scoring_type: config.scoringType,
    draft_type: config.draftType,
    team_count: config.teamCount,
    category: 'league',
  });
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

/**
 * Track analytics page usage
 * @param leagueId - The league ID
 * @param tab - Which analytics tab was viewed
 */
export function trackAnalyticsViewed(
  leagueId: number,
  tab: 'overview' | 'power' | 'playoff' | 'h2h',
): void {
  trackEvent('analytics_viewed', {
    league_id: leagueId,
    analytics_tab: tab,
    category: 'analytics',
  });
}

// =============================================================================
// Search & Discovery Events
// =============================================================================

/**
 * Track search usage
 * @param searchTerm - What the user searched for
 * @param resultCount - Number of results returned
 * @param context - Where the search occurred
 */
export function trackSearch(
  searchTerm: string,
  resultCount: number,
  context: 'players' | 'leagues' | 'teams',
): void {
  trackEvent('search', {
    search_term: searchTerm,
    result_count: resultCount,
    search_context: context,
    category: 'search',
  });
}

// =============================================================================
// Performance & Error Tracking
// =============================================================================

/**
 * Track errors for debugging and monitoring
 * @param errorType - Type/category of error
 * @param errorMessage - Error message
 * @param context - Additional context about the error
 */
export function trackError(
  errorType: string,
  errorMessage: string,
  context?: Record<string, unknown>,
): void {
  trackEvent('app_error', {
    error_type: errorType,
    error_message: errorMessage,
    ...context,
    category: 'error',
  });
}

/**
 * Track feature engagement timing
 * @param category - Timing category (e.g., 'page_load', 'api_call')
 * @param variable - What is being timed
 * @param timeMs - Time in milliseconds
 */
export function trackTiming(
  category: string,
  variable: string,
  timeMs: number,
): void {
  trackEvent('timing_complete', {
    timing_category: category,
    timing_var: variable,
    value: timeMs,
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
