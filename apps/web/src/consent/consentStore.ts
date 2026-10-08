/**
 * Analytics consent state (LS-10764).
 *
 * Two categories exist: "strictly necessary" (always on, never stored here)
 * and "analytics" (GA4 + GrowthBook experiment tracking). Ad signals are
 * always denied and are not a choice.
 *
 * A saved choice lasts 12 months and is tied to CONSENT_VERSION — bump the
 * version when the policy or the consent categories change and every visitor
 * is asked again. If storage is blocked (private mode), the choice applies
 * for this page session only and the banner returns on the next visit.
 */

import { useSyncExternalStore } from 'react';
import { isConsentRequiredRegion } from './consentRegion';

export const CONSENT_STORAGE_KEY = 'ls_consent';
/** Bump to re-prompt everyone (policy or category change). */
export const CONSENT_VERSION = 1;
export const CONSENT_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

interface StoredConsent {
  version: number;
  analytics: boolean;
  savedAt: number;
}

export interface ConsentSnapshot {
  /** Visitor is in a region where analytics is opt-in (EU/EEA/UK/CH). */
  readonly regionRequiresConsent: boolean;
  /** Analytics (GA4 + GrowthBook tracking) may run. */
  readonly analytics: boolean;
  /** Visitor has made an explicit choice that is still valid. */
  readonly decided: boolean;
  /** The Manage panel ("Cookie settings") is open. */
  readonly settingsOpen: boolean;
}

let snapshot: ConsentSnapshot | undefined;
const listeners = new Set<() => void>();
/** Element focused when the Manage panel opened; focus returns there. */
let returnFocusTarget: HTMLElement | null = null;

function readStoredConsent(now: number): StoredConsent | null {
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredConsent>;
    if (
      parsed.version !== CONSENT_VERSION ||
      typeof parsed.analytics !== 'boolean' ||
      typeof parsed.savedAt !== 'number' ||
      now - parsed.savedAt > CONSENT_MAX_AGE_MS
    ) {
      return null;
    }
    return parsed as StoredConsent;
  } catch {
    return null;
  }
}

function writeStoredConsent(analytics: boolean): void {
  const value: StoredConsent = {
    version: CONSENT_VERSION,
    analytics,
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage blocked: the in-memory snapshot still applies for this session.
  }
}

function createInitialSnapshot(): ConsentSnapshot {
  const regionRequiresConsent = isConsentRequiredRegion();
  const stored = readStoredConsent(Date.now());
  return {
    regionRequiresConsent,
    analytics: stored ? stored.analytics : !regionRequiresConsent,
    decided: stored !== null,
    settingsOpen: false,
  };
}

function setSnapshot(next: ConsentSnapshot): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function getConsentSnapshot(): ConsentSnapshot {
  if (!snapshot) snapshot = createInitialSnapshot();
  return snapshot;
}

export function subscribeConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True when GA4 and GrowthBook tracking callbacks may run. */
export function hasAnalyticsConsent(): boolean {
  return getConsentSnapshot().analytics;
}

/** The first-visit banner shows only for opt-in regions with no valid choice. */
export function isConsentBannerVisible(state: ConsentSnapshot): boolean {
  return state.regionRequiresConsent && !state.decided && !state.settingsOpen;
}

/** Persist the visitor's analytics choice and close the Manage panel. */
export function saveConsent(analytics: boolean): void {
  writeStoredConsent(analytics);
  setSnapshot({
    ...getConsentSnapshot(),
    analytics,
    decided: true,
    settingsOpen: false,
  });
}

/** Open the Manage panel ("Cookie settings" links). */
export function openCookieSettings(): void {
  // Captured before the dialog mounts and moves focus into itself.
  returnFocusTarget =
    typeof document !== 'undefined' &&
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  setSnapshot({ ...getConsentSnapshot(), settingsOpen: true });
}

/** Close the Manage panel without changing the choice. */
export function closeCookieSettings(): void {
  setSnapshot({ ...getConsentSnapshot(), settingsOpen: false });
}

/** Hand back (once) the element that had focus when the panel opened. */
export function takeReturnFocusTarget(): HTMLElement | null {
  const target = returnFocusTarget;
  returnFocusTarget = null;
  return target;
}

export function useConsent(): ConsentSnapshot {
  return useSyncExternalStore(
    subscribeConsent,
    getConsentSnapshot,
    getConsentSnapshot,
  );
}

/** Test-only: drop cached state so the next read re-derives it. */
export function resetConsentStoreForTests(): void {
  snapshot = undefined;
  returnFocusTarget = null;
  listeners.clear();
}
