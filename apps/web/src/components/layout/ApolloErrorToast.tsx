import React, { useCallback, useEffect, useRef, useState } from 'react';

interface ApolloErrorEvent extends CustomEvent {
  detail: { message: string };
}

const DISMISS_MS = 5000;

/**
 * Global toast that surfaces uncaught Apollo/GraphQL errors to the user.
 *
 * The Apollo ErrorLink dispatches a `apollo:error` CustomEvent on `window`
 * whenever a GraphQL or network error is not handled by the auth-refresh path.
 * This component listens for that event and shows a dismissable error banner.
 */
export function ApolloErrorToast(): React.JSX.Element | null {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessage(null);
  }, []);

  const show = useCallback(
    (msg: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setMessage(msg);
      timerRef.current = setTimeout(dismiss, DISMISS_MS);
    },
    [dismiss],
  );

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as ApolloErrorEvent).detail;
      if (detail?.message) {
        show(detail.message);
      }
    };
    window.addEventListener('apollo:error', handler);
    return () => {
      window.removeEventListener('apollo:error', handler);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [show]);

  if (!message) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        maxWidth: 420,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '12px 16px',
        borderRadius: 10,
        background: '#1E0A0A',
        border: '1px solid rgba(196, 30, 58, 0.6)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        color: '#f8d7da',
        fontSize: 13,
        fontWeight: 500,
        lineHeight: 1.5,
        animation: 'apolloErrorFadeIn 0.25s ease-out',
      }}
    >
      {/* Error icon */}
      <span
        aria-hidden="true"
        style={{ fontSize: 16, lineHeight: '20px', flexShrink: 0 }}
      >
        ⚠️
      </span>

      {/* Message */}
      <span style={{ flex: 1 }}>{message}</span>

      {/* Dismiss button */}
      <button
        aria-label="Dismiss error"
        onClick={dismiss}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#f8d7da',
          fontSize: 16,
          lineHeight: '20px',
          padding: 0,
          flexShrink: 0,
          opacity: 0.7,
        }}
      >
        ✕
      </button>

      {/* Keyframe animation — injected once */}
      <style>{`
        @keyframes apolloErrorFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
