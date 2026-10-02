import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

export const SAVED_BANNER_DURATION_MS = 2000;

/** `ok = false` flashes the banner in its "Failed to save" state. */
type TriggerSave = (ok?: boolean) => void;

const SavedBannerContext = createContext<TriggerSave | null>(null);

/**
 * Owns the "Saved" banner visibility. Every save path (device-local prefs,
 * notification mutations, any future pref type) calls the same `triggerSave()`
 * instead of wiring its own banner flash. Repeated calls restart a single
 * timer, so overlapping saves never hide the banner early.
 */
export function useSavedBanner(): {
  saved: boolean;
  saveFailed: boolean;
  triggerSave: TriggerSave;
} {
  const [saved, setSaved] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerSave = useCallback<TriggerSave>((ok = true) => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    setSaveFailed(!ok);
    setSaved(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setSaved(false);
    }, SAVED_BANNER_DURATION_MS);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  return { saved, saveFailed, triggerSave };
}

export function SavedBannerProvider({
  triggerSave,
  children,
}: {
  triggerSave: TriggerSave;
  children: React.ReactNode;
}) {
  return (
    <SavedBannerContext.Provider value={triggerSave}>
      {children}
    </SavedBannerContext.Provider>
  );
}

/** Returns the page-level `triggerSave()`; must be used under a provider. */
export function useTriggerSave(): TriggerSave {
  const triggerSave = useContext(SavedBannerContext);
  if (!triggerSave) {
    throw new Error('useTriggerSave must be used within a SavedBannerProvider');
  }
  return triggerSave;
}
