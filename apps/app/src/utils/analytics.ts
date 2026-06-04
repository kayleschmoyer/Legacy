/**
 * Mobile analytics utility — Firebase Analytics via @react-native-firebase/analytics.
 *
 * Mirrors the web analytics module interface so callers can be swapped between
 * platforms without changes.  Event names and parameter keys match the web GA4
 * implementation for cross-platform reporting.
 */

import analytics from '@react-native-firebase/analytics';
import { LOGGER } from '@legacy-sports/logging';

// Internal state — kept in sync with Firebase user properties
let _subscriptionTier: 'free' | 'premium' | undefined;
let _userId: string | undefined;

async function trackEvent(
  eventName: string,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<void> {
  try {
    // Strip undefined values — Firebase Analytics rejects them
    const clean: Record<string, string | number | boolean> = {};
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) clean[k] = v;
      }
    }
    if (_subscriptionTier !== undefined) {
      clean['subscription_tier'] = _subscriptionTier;
    }
    await analytics().logEvent(eventName, clean);
    LOGGER.info('[Analytics] Event tracked:', eventName, clean);
  } catch (err) {
    LOGGER.warn(
      '[Analytics] Event failed (non-fatal):',
      eventName,
      err instanceof Error ? err : new Error(String(err)),
    );
  }
}

export async function setUserId(userId: string | number): Promise<void> {
  _userId = String(userId);
  try {
    await analytics().setUserId(_userId);
    LOGGER.info('[Analytics] User ID set:', _userId);
  } catch (err) {
    LOGGER.warn(
      '[Analytics] setUserId failed (non-fatal):',
      err instanceof Error ? err : new Error(String(err)),
    );
  }
}

export async function setUserProperties(properties: {
  userId?: string | number;
  subscriptionTier?: 'free' | 'premium';
}): Promise<void> {
  if (properties.subscriptionTier !== undefined) {
    _subscriptionTier = properties.subscriptionTier;
    try {
      await analytics().setUserProperty(
        'subscription_tier',
        properties.subscriptionTier,
      );
    } catch (err) {
      LOGGER.warn(
        '[Analytics] setUserProperty subscription_tier failed:',
        err instanceof Error ? err : new Error(String(err)),
      );
    }
  }
  if (properties.userId !== undefined) {
    await setUserId(properties.userId);
  }
  LOGGER.info('[Analytics] User properties set:', properties);
}

export function trackLogin(method: string): void {
  void trackEvent('login', { method });
}

export function trackSignup(method: string): void {
  void trackEvent('sign_up', { method });
}

export function trackPremiumFeatureClick(featureName: string): void {
  void trackEvent('premium_feature_click', {
    feature_name: featureName,
    category: 'monetization',
  });
}

export function trackPremiumFeatureBlocked(featureName: string): void {
  void trackEvent('premium_feature_blocked', {
    feature_name: featureName,
    category: 'monetization',
  });
}

export function trackSubscriptionStarted(tier: 'premium'): void {
  void trackEvent('subscription_started', { tier, category: 'monetization' });
}

export function trackSubscriptionCancelled(tier: 'premium'): void {
  void trackEvent('subscription_cancelled', {
    tier,
    category: 'monetization',
  });
}

export function trackSubscriptionRenewed(tier: 'premium'): void {
  void trackEvent('subscription_renewed', { tier, category: 'monetization' });
}

export function trackMinigameTap(gameId: string): void {
  void trackEvent('minigame_tap', { game_id: gameId, category: 'engagement' });
}
