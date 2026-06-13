import { useCallback, useRef, useState } from 'react';

/** sessionStorage key for the step-up freshness timestamp (Unix seconds). */
const STEP_UP_KEY = 'ls_step_up_until';

/**
 * Returns true when a successful step-up verification exists and has not yet
 * expired. Uses sessionStorage so the freshness window is per-tab and does
 * not persist across browser restarts.
 */
export function isStepUpFresh(): boolean {
  try {
    if (typeof sessionStorage === 'undefined') return false;
    const raw = sessionStorage.getItem(STEP_UP_KEY);
    return raw !== null && Number(raw) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

/** Persist a successful step-up timestamp returned by /oauth/step-up/verify. */
export function markStepUpVerified(validUntil: number): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(STEP_UP_KEY, String(validUntil));
    }
  } catch {
    // sessionStorage unavailable — freshness degrades to per-check
  }
}

/** Clear the step-up freshness record (e.g. on logout). */
export function clearStepUp(): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(STEP_UP_KEY);
    }
  } catch {
    // ignore
  }
}

export interface UseStepUpGateResult {
  /** True when the step-up challenge modal should be displayed. */
  isPrompting: boolean;
  /**
   * Gate an action behind a fresh step-up. If a valid step-up already exists
   * the action fires immediately; otherwise the challenge modal opens and the
   * action is deferred until the user completes it.
   */
  requireStepUp: (action: () => void | Promise<void>) => void;
  /**
   * Called by the modal on successful verification. Persists the freshness
   * window and executes the deferred action.
   */
  onVerified: (validUntil: number) => void;
  /** Called when the user dismisses the modal without verifying. */
  onDismiss: () => void;
}

/**
 * Manages step-up re-authentication state for sensitive actions (billing and
 * commissioner operations, LGN-022 / LS-7834). Renders no UI itself — pair
 * with `<StepUpModal>` when `isPrompting` is true.
 */
export function useStepUpGate(): UseStepUpGateResult {
  const [isPrompting, setIsPrompting] = useState(false);
  const pendingAction = useRef<(() => void | Promise<void>) | null>(null);

  const requireStepUp = useCallback((action: () => void | Promise<void>) => {
    if (isStepUpFresh()) {
      void Promise.resolve(action());
      return;
    }
    pendingAction.current = action;
    setIsPrompting(true);
  }, []);

  const onVerified = useCallback((validUntil: number) => {
    markStepUpVerified(validUntil);
    setIsPrompting(false);
    const action = pendingAction.current;
    pendingAction.current = null;
    if (action) void Promise.resolve(action());
  }, []);

  const onDismiss = useCallback(() => {
    setIsPrompting(false);
    pendingAction.current = null;
  }, []);

  return { isPrompting, requireStepUp, onVerified, onDismiss };
}
