import React, { useCallback, useEffect, useState } from 'react';
import { Button, Input, Paragraph, Spinner, XStack, YStack } from 'tamagui';
import { AlertTriangle, Shield } from '@tamagui/lucide-icons';
import { LOGGER } from '@legacy-sports/logging';
import { useAuth } from '@legacy-sports/shared-components/auth';
import {
  AMBER,
  BG_DARK,
  BRAND_GOLD,
  BRAND_NAVY,
  BRAND_NAVY_DARK,
  withAlpha,
} from '../constants/colors';

export interface StepUpModalProps {
  /** Called with the validUntil Unix timestamp (s) on successful verification. */
  onSuccess: (validUntil: number) => void;
  /** Called when the user dismisses the modal without verifying. */
  onDismiss: () => void;
}

/**
 * Step-up challenge mode.
 * - `totp`     — prompt for a TOTP code (MFA-enrolled users).
 * - `password` — prompt for the account password.
 * - `checking` — no local credential is known (OAuth-only account): silently
 *   confirm the active session with the server, which grants step-up when there
 *   is genuinely no second factor to challenge and otherwise tells us which
 *   credential to prompt for.
 */
type StepUpMode = 'totp' | 'password' | 'checking';

function getCsrfToken(): string {
  try {
    return (
      (typeof localStorage !== 'undefined' &&
        localStorage.getItem('ls_csrf_token')) ||
      ''
    );
  } catch {
    return '';
  }
}

/**
 * Step-up re-authentication challenge modal (LGN-022 / LS-7834).
 *
 * Shown before billing and commissioner actions that require proof of a fresh
 * user credential. Displays a TOTP input for MFA-enrolled users and a password
 * input for password accounts, with a toggle between the two modes.
 *
 * OAuth-only accounts (Google/Discord) have neither a password nor MFA, so there
 * is no credential to re-enter. For those users the modal confirms the active
 * session with the server instead of dead-ending on a password prompt they can
 * never satisfy.
 */
export function StepUpModal({ onSuccess, onDismiss }: StepUpModalProps) {
  const { config, user } = useAuth();
  const oauthProxyUrl = config.oauthProxyUrl;

  const [mode, setMode] = useState<StepUpMode>(
    user?.mfaEnabled ? 'totp' : user?.hasPassword ? 'password' : 'checking',
  );
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const postVerify = useCallback(
    (body: Record<string, unknown>): Promise<Response> => {
      const csrf = getCsrfToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (csrf) headers['X-CSRF-Token'] = csrf;
      return fetch(`${oauthProxyUrl}/step-up/verify`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(body),
      });
    },
    [oauthProxyUrl],
  );

  // Session-only confirmation for accounts with no local credential. The server
  // grants step-up when the user has neither a password nor MFA; if it turns out
  // a credential does exist (e.g. a stale token), it tells us which one to
  // prompt for and we switch modes instead of leaving the user stuck.
  const runSessionProbe = useCallback(async () => {
    if (!oauthProxyUrl) {
      setError(
        'Authentication service is not configured. Please contact support.',
      );
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await postVerify({});
      if (response.ok) {
        const data = (await response.json()) as { validUntil: number };
        onSuccess(data.validUntil);
        return;
      }
      const data = (await response.json()) as { error?: string };
      if (data.error === 'mfa_required') {
        setMode('totp');
      } else {
        // password_required, or an unexpected error — fall back to a password
        // prompt so the user still has a way forward.
        setMode('password');
      }
    } catch (err) {
      LOGGER.error(
        'StepUpModal: session probe error',
        err instanceof Error ? err : new Error(String(err)),
      );
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [oauthProxyUrl, postVerify, onSuccess]);

  useEffect(() => {
    if (mode === 'checking') void runSessionProbe();
    // Only re-run when entering `checking`; runSessionProbe is stable.
  }, [mode, runSessionProbe]);

  const handleSubmit = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (!oauthProxyUrl) {
      setError(
        'Authentication service is not configured. Please contact support.',
      );
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const response = await postVerify(
        mode === 'totp' ? { code: trimmed } : { password: trimmed },
      );

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        if (data.error === 'mfa_not_enrolled' && mode === 'totp') {
          setMode('password');
          setValue('');
          setError('Authenticator not set up. Please use your password.');
        } else if (data.error === 'no_password' && mode === 'password') {
          // The account has no password after all (e.g. a stale token) — confirm
          // the session instead of prompting for a credential that doesn't exist.
          setValue('');
          setMode('checking');
        } else {
          setError('Incorrect credential. Please try again.');
        }
        return;
      }

      const data = (await response.json()) as { validUntil: number };
      onSuccess(data.validUntil);
    } catch (err) {
      LOGGER.error(
        'StepUpModal: fetch error',
        err instanceof Error ? err : new Error(String(err)),
      );
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const isChecking = mode === 'checking';

  return (
    <YStack
      position="fixed"
      top={0}
      left={0}
      right={0}
      bottom={0}
      alignItems="center"
      justifyContent="center"
      zIndex={2000}
      style={{ backgroundColor: 'rgba(0,0,0,0.65)' } as React.CSSProperties}
      onPress={onDismiss}
    >
      <YStack
        maxWidth={420}
        width="92%"
        borderRadius="$5"
        overflow="hidden"
        borderWidth={1}
        borderColor={withAlpha(BRAND_NAVY, 0.4)}
        onPress={(e: { stopPropagation: () => void }) => e.stopPropagation()}
      >
        {/* Header */}
        <XStack
          paddingHorizontal="$5"
          paddingVertical="$4"
          gap="$3"
          alignItems="center"
          style={{
            background: `linear-gradient(135deg, ${BRAND_NAVY} 0%, ${BRAND_NAVY_DARK} 100%)`,
          }}
        >
          <Shield size={20} color={BRAND_GOLD} />
          <YStack flex={1} gap="$0.5">
            <Paragraph size="$5" fontWeight="700" color="white">
              Confirm your identity
            </Paragraph>
            <Paragraph size="$2" style={{ color: 'rgba(255,255,255,0.7)' }}>
              Re-authentication required for this action
            </Paragraph>
          </YStack>
        </XStack>

        {/* Body */}
        <YStack padding="$5" gap="$4" backgroundColor="$background">
          <Paragraph size="$3" color="$colorPress">
            {isChecking
              ? 'Confirming your identity…'
              : mode === 'totp'
                ? 'Enter the 6-digit code from your authenticator app.'
                : 'Enter your password to continue.'}
          </Paragraph>

          {isChecking ? (
            !error && (
              <XStack gap="$3" alignItems="center" paddingVertical="$2">
                <Spinner size="small" color={BRAND_GOLD} />
                <Paragraph size="$3" color="$colorPress">
                  Please wait…
                </Paragraph>
              </XStack>
            )
          ) : (
            <Input
              value={value}
              onChangeText={setValue}
              placeholder={mode === 'totp' ? '6-digit code' : 'Password'}
              secureTextEntry={mode === 'password'}
              keyboardType={mode === 'totp' ? 'numeric' : 'default'}
              maxLength={mode === 'totp' ? 6 : undefined}
              autoFocus
              onSubmitEditing={() => void handleSubmit()}
              accessible
              accessibilityLabel={
                mode === 'totp' ? 'Authenticator code' : 'Password'
              }
            />
          )}

          {error && (
            <XStack
              gap="$2"
              padding="$3"
              borderRadius="$3"
              alignItems="flex-start"
              style={
                {
                  backgroundColor: withAlpha(AMBER, 0.08),
                  borderWidth: 1,
                  borderColor: withAlpha(AMBER, 0.3),
                } as React.CSSProperties
              }
            >
              <AlertTriangle
                size={14}
                color={AMBER}
                flexShrink={0}
                marginTop={2}
              />
              <Paragraph size="$2" style={{ color: AMBER }}>
                {error}
              </Paragraph>
            </XStack>
          )}

          <XStack gap="$3" justifyContent="space-between" alignItems="center">
            {/* Mode toggle — hidden while confirming the session. */}
            {isChecking ? (
              <YStack flex={1} />
            ) : (
              <Button
                size="$2"
                chromeless
                onPress={() => {
                  setMode((m) => (m === 'totp' ? 'password' : 'totp'));
                  setValue('');
                  setError(null);
                }}
                style={{ color: BRAND_GOLD }}
              >
                {mode === 'totp'
                  ? 'Use password instead'
                  : user?.mfaEnabled
                    ? 'Use authenticator instead'
                    : null}
              </Button>
            )}

            <XStack gap="$2">
              <Button
                size="$3"
                onPress={onDismiss}
                disabled={loading}
                backgroundColor="$color3"
                color="$color"
              >
                Cancel
              </Button>
              {isChecking ? (
                // Only offer a manual retry if the session probe failed; a
                // successful probe resolves without any button press.
                error ? (
                  <Button
                    size="$3"
                    onPress={() => void runSessionProbe()}
                    disabled={loading}
                    icon={loading ? <Spinner size="small" /> : undefined}
                    style={{
                      background: `linear-gradient(135deg, ${BRAND_GOLD} 0%, ${BRAND_GOLD}cc 100%)`,
                      color: BG_DARK,
                      fontWeight: '700',
                    }}
                  >
                    {loading ? 'Verifying…' : 'Try again'}
                  </Button>
                ) : null
              ) : (
                <Button
                  size="$3"
                  onPress={() => void handleSubmit()}
                  disabled={loading || !value.trim()}
                  icon={loading ? <Spinner size="small" /> : undefined}
                  style={{
                    background: `linear-gradient(135deg, ${BRAND_GOLD} 0%, ${BRAND_GOLD}cc 100%)`,
                    color: BG_DARK,
                    fontWeight: '700',
                  }}
                >
                  {loading ? 'Verifying…' : 'Verify'}
                </Button>
              )}
            </XStack>
          </XStack>
        </YStack>
      </YStack>
    </YStack>
  );
}
