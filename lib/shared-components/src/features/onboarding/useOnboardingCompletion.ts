import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useGetUserPreferencesQuery,
  useUpdateUserPreferencesMutation,
} from '@legacy-sports/graphql';
import { LOGGER } from '@legacy-sports/logging';
import {
  getOnboardingKey,
  migrateLegacyOnboardingFlag,
  type OnboardingStorage,
  parseOnboardingComplete,
  serializeOnboardingComplete,
} from './onboardingCompletion';

export interface UseOnboardingCompletionOptions {
  userId: number | null | undefined;
  /** Per-platform local store (web `localStorage`, native `AsyncStorage` shim). */
  storage: OnboardingStorage;
  /** Skip the server query, e.g. when there is no persisted session. */
  skip?: boolean;
  /** Extra local keys (e.g. a saved tutorial step) cleared once complete. */
  clearKeys?: string[];
}

export interface UseOnboardingCompletionResult {
  /** Server flag settled (value or error) and the local flag was read. */
  resolved: boolean;
  /** True once resolved and the user has not completed onboarding. */
  shouldAutoShow: boolean;
  /** Records completion on the server (set-once) and locally. Idempotent. */
  markComplete: () => void;
}

type LocalState = 'pending' | 'complete' | 'incomplete';

function toError(caught: unknown): Error {
  return caught instanceof Error ? caught : new Error(String(caught));
}

/**
 * Decides whether to auto-show the onboarding tutorial. The server
 * `onboardingCompletedAt` flag is the source of truth so completion follows
 * the user across devices; the injected local store is a same-device cache and
 * the fallback when the server query fails (LS-10382).
 */
export function useOnboardingCompletion({
  userId,
  storage,
  skip = false,
  clearKeys = [],
}: UseOnboardingCompletionOptions): UseOnboardingCompletionResult {
  const {
    data,
    loading,
    error: prefsError,
  } = useGetUserPreferencesQuery({
    skip: skip || !userId,
    fetchPolicy: 'cache-and-network',
  });
  const [updatePreferences] = useUpdateUserPreferencesMutation();
  const [state, setState] = useState<LocalState>('pending');
  const backfilledFor = useRef<number | null>(null);

  const settled = !loading && (data != null || !!prefsError);
  const serverComplete =
    data?.getUserPreferences?.onboardingCompletedAt != null;
  const clearKeysId = clearKeys.join('\u0000');

  const persistToServer = useCallback(() => {
    updatePreferences({
      variables: { input: { markOnboardingComplete: true } },
    }).catch((caught: unknown) => {
      LOGGER.error(
        'useOnboardingCompletion: failed to persist completion to server',
        toError(caught),
      );
    });
  }, [updatePreferences]);

  useEffect(() => {
    if (!userId || !settled) return;
    const key = getOnboardingKey(userId);
    const keysToClear = clearKeysId ? clearKeysId.split('\u0000') : [];
    if (prefsError) {
      LOGGER.warn(
        'useOnboardingCompletion: preferences query failed, using local flag',
        toError(prefsError),
      );
    }
    try {
      if (serverComplete) {
        setState('complete');
        // Seed this device so the flag survives a later server outage.
        storage.setItem(key, serializeOnboardingComplete(true));
        keysToClear.forEach((k) => storage.removeItem(k));
        return;
      }
      const completed =
        migrateLegacyOnboardingFlag(storage, key) ||
        parseOnboardingComplete(storage.getItem(key));
      setState(completed ? 'complete' : 'incomplete');
      if (completed && !prefsError && backfilledFor.current !== userId) {
        // Completed before the server flag existed: one-time backfill.
        backfilledFor.current = userId;
        persistToServer();
      }
    } catch (caught) {
      // Without storage we cannot tell whether onboarding was completed, so
      // do not re-show it on every visit.
      setState('complete');
      LOGGER.error(
        'useOnboardingCompletion: local storage access failed',
        toError(caught),
      );
    }
  }, [
    userId,
    settled,
    prefsError,
    serverComplete,
    storage,
    clearKeysId,
    persistToServer,
  ]);

  const markComplete = useCallback(() => {
    if (!userId || state === 'complete') return;
    setState('complete');
    persistToServer();
    try {
      storage.setItem(
        getOnboardingKey(userId),
        serializeOnboardingComplete(true),
      );
      clearKeysId
        .split('\u0000')
        .filter(Boolean)
        .forEach((k) => storage.removeItem(k));
    } catch (caught) {
      LOGGER.error(
        'useOnboardingCompletion: failed to persist completion locally',
        toError(caught),
      );
    }
  }, [userId, state, storage, clearKeysId, persistToServer]);

  return {
    resolved: state !== 'pending',
    shouldAutoShow: state === 'incomplete',
    markComplete,
  };
}
