import { useCallback, useEffect, useRef, useState } from 'react';
import { AuthService } from '../services/AuthService';

export interface MfaEnrollData {
  secret: string;
  otpauthUri: string;
}

export interface UseMfaResult {
  /** null while the initial status fetch is in flight. */
  mfaEnabled: boolean | null;
  isLoading: boolean;
  error: string | null;
  /** Set during the enrollment flow (after startEnrollment succeeds). */
  enrollData: MfaEnrollData | null;
  startEnrollment: () => Promise<void>;
  verifySetup: (code: string) => Promise<void>;
  disable: () => Promise<void>;
  cancelEnrollment: () => void;
  clearError: () => void;
}

export function useMfa(authService: AuthService): UseMfaResult {
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enrollData, setEnrollData] = useState<MfaEnrollData | null>(null);
  // Track whether the component is still mounted to avoid state updates after unmount.
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    void authService
      .getMfaStatus()
      .then((status) => {
        if (mountedRef.current) setMfaEnabled(status.mfaEnabled);
      })
      .catch(() => {
        if (mountedRef.current) setMfaEnabled(false);
      });
    return () => {
      mountedRef.current = false;
    };
  }, [authService]);

  const startEnrollment = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await authService.startMfaEnrollment();
      if (mountedRef.current) setEnrollData(data);
    } catch (err) {
      if (mountedRef.current)
        setError(err instanceof Error ? err.message : 'Enrollment failed');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [authService]);

  const verifySetup = useCallback(
    async (code: string) => {
      setIsLoading(true);
      setError(null);
      try {
        await authService.verifyMfaSetup(code);
        if (mountedRef.current) {
          setMfaEnabled(true);
          setEnrollData(null);
        }
      } catch (err) {
        if (mountedRef.current)
          setError(err instanceof Error ? err.message : 'Verification failed');
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    },
    [authService],
  );

  const disable = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await authService.disableMfa();
      if (mountedRef.current) setMfaEnabled(false);
    } catch (err) {
      if (mountedRef.current)
        setError(err instanceof Error ? err.message : 'Disable failed');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [authService]);

  const cancelEnrollment = useCallback(() => {
    setEnrollData(null);
    setError(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    mfaEnabled,
    isLoading,
    error,
    enrollData,
    startEnrollment,
    verifySetup,
    disable,
    cancelEnrollment,
    clearError,
  };
}
