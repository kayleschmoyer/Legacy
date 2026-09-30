import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveStatus = 'idle' | 'retrying' | 'failed';

interface RetryingSaveOptions {
  /** Automatic retries after the first failed attempt before giving up. */
  maxAutoRetries: number;
  /** Delay before the first retry; doubles on each further attempt. */
  baseDelayMs: number;
  /** Called once the server has confirmed the outstanding changes. */
  onSaved?: () => void;
}

/**
 * Keeps a failed save from being silently lost (LS-7082). Changes that the
 * server has not confirmed stay in a queue and are re-sent with exponential
 * backoff, immediately when the browser comes back online, or on demand via
 * `retryNow` once the automatic retries are exhausted. A newer `save`
 * supersedes an in-flight attempt by sending the merged unsaved patch, so a
 * late response for an older attempt is ignored.
 */
export function useRetryingSave<T extends object>(
  send: (patch: T) => Promise<unknown>,
  { maxAutoRetries, baseDelayMs, onSaved }: RetryingSaveOptions,
): { save: (patch: T) => void; retryNow: () => void; status: SaveStatus } {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const unsavedRef = useRef<Partial<T>>({});
  const seqRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendRef = useRef(send);
  sendRef.current = send;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const attempt = useCallback(
    (failures: number) => {
      clearTimer();
      const patch = unsavedRef.current;
      if (Object.keys(patch).length === 0) return;
      const seq = ++seqRef.current;
      sendRef.current(patch as T).then(
        () => {
          if (seq !== seqRef.current) return;
          unsavedRef.current = {};
          setStatus('idle');
          onSavedRef.current?.();
        },
        () => {
          if (seq !== seqRef.current) return;
          if (failures >= maxAutoRetries) {
            setStatus('failed');
            return;
          }
          setStatus('retrying');
          timerRef.current = setTimeout(
            () => attempt(failures + 1),
            baseDelayMs * 2 ** failures,
          );
        },
      );
    },
    [clearTimer, maxAutoRetries, baseDelayMs],
  );

  const save = useCallback(
    (patch: T) => {
      unsavedRef.current = { ...unsavedRef.current, ...patch };
      setStatus((prev) => (prev === 'idle' ? prev : 'retrying'));
      attempt(0);
    },
    [attempt],
  );

  const retryNow = useCallback(() => {
    setStatus('retrying');
    attempt(0);
  }, [attempt]);

  useEffect(() => {
    const onOnline = () => {
      if (Object.keys(unsavedRef.current).length === 0) return;
      setStatus('retrying');
      attempt(0);
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [attempt]);

  useEffect(() => clearTimer, [clearTimer]);

  return { save, retryNow, status };
}
