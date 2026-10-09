import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  GREEN_DEEP,
  OVERLAY_BLACK_12,
  OVERLAY_BLACK_40,
  WHITE,
} from '../../constants/colors';
import { useThemeContext } from '../../context/ThemeContext';

const TOAST_EVENT = 'app:toast';
const DISMISS_MS = 4000;

/**
 * Show a success toast from anywhere — including after the calling component
 * has unmounted (e.g. an in-flight mutation that resolves post-navigation,
 * LS-7236). Rendered by {@link SuccessToast}, which lives at the app root.
 */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  /** Optional button rendered beside the message (e.g. "Undo"). */
  action?: ToastAction;
  /** Overrides the default auto-dismiss delay. */
  durationMs?: number;
}

export function showToast(message: string, options?: ToastOptions): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(TOAST_EVENT, { detail: { message, ...options } }),
  );
}

/** Global, route-independent success toast driven by {@link showToast}. */
export function SuccessToast(): React.JSX.Element | null {
  const [message, setMessage] = useState<string | null>(null);
  const [action, setAction] = useState<ToastAction | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { resolvedTheme } = useThemeContext();
  const isLight = resolvedTheme === 'light';

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessage(null);
    setAction(null);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ message?: string } & ToastOptions>)
        .detail;
      if (!detail?.message) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      setMessage(detail.message);
      setAction(detail.action ?? null);
      timerRef.current = setTimeout(dismiss, detail.durationMs ?? DISMISS_MS);
    };
    window.addEventListener(TOAST_EVENT, handler);
    return () => {
      window.removeEventListener(TOAST_EVENT, handler);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [dismiss]);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        maxWidth: 420,
        padding: '12px 16px',
        borderRadius: 10,
        background: GREEN_DEEP,
        color: WHITE,
        boxShadow: isLight
          ? `0 8px 32px ${OVERLAY_BLACK_12}`
          : `0 8px 32px ${OVERLAY_BLACK_40}`,
        fontSize: 13,
        fontWeight: 500,
        lineHeight: 1.5,
      }}
    >
      {message}
      {action && (
        <button
          type="button"
          onClick={() => {
            dismiss();
            action.onClick();
          }}
          style={{
            marginLeft: 12,
            padding: 0,
            background: 'none',
            border: 'none',
            color: WHITE,
            font: 'inherit',
            fontWeight: 700,
            textDecoration: 'underline',
            cursor: 'pointer',
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
