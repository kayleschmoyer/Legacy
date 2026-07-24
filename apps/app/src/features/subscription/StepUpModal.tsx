import React, { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import {
  Button,
  Input,
  Paragraph,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { LOGGER } from '@legacy-sports/logging';
import { captureError } from '@legacy-sports/rollbar/native';
import { readKeychainValue, Secret } from '../../common/auth/AuthHooks';
import { getMobileOAuthConfig } from '../../common/auth/mobileOAuthConfig';

export interface StepUpModalProps {
  /** Called with the validUntil Unix timestamp (s) on successful verification. */
  onSuccess: (validUntil: number) => void;
  /** Called when the user dismisses the modal without verifying. */
  onDismiss: () => void;
  /** Whether the user has MFA enrolled — defaults TOTP mode when true. */
  mfaEnabled?: boolean;
  /**
   * Whether the account has a local password. OAuth-only accounts
   * (Google/Discord) have none; when false (and no MFA) the modal confirms the
   * active session instead of prompting for a password the user cannot enter.
   */
  hasPassword?: boolean;
}

/**
 * Step-up challenge mode.
 * - `totp`     — prompt for a TOTP code (MFA-enrolled users).
 * - `password` — prompt for the account password.
 * - `checking` — no local credential is known (OAuth-only account): silently
 *   confirm the active session with the server, which grants step-up when there
 *   is genuinely no second factor and otherwise reports which credential to
 *   prompt for.
 */
type StepUpMode = 'totp' | 'password' | 'checking';

/**
 * Step-up re-authentication challenge modal for the native app (LS-5029).
 *
 * Mirrors the web StepUpModal: requires a fresh credential (TOTP or password)
 * before sensitive billing actions. Sends the internal JWT as a Bearer token
 * to POST /step-up/verify — no cookies or CSRF required from mobile.
 */
export function StepUpModal({
  onSuccess,
  onDismiss,
  mfaEnabled = false,
  hasPassword = true,
}: StepUpModalProps): React.JSX.Element {
  const [mode, setMode] = useState<StepUpMode>(
    mfaEnabled ? 'totp' : hasPassword ? 'password' : 'checking',
  );
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const postVerify = useCallback(
    async (body: Record<string, unknown>): Promise<Response | null> => {
      const { oauthProxyUrl } = getMobileOAuthConfig();
      if (!oauthProxyUrl) {
        setError('Authentication unavailable. Please try again later.');
        return null;
      }
      const token = await readKeychainValue(Secret.INTERNAL_JWT);
      if (!token) {
        setError('Session expired. Please sign in again.');
        return null;
      }
      return fetch(`${oauthProxyUrl}/step-up/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
    },
    [],
  );

  // Session-only confirmation for accounts with no local credential. The server
  // grants step-up when the user has neither a password nor MFA; if a credential
  // does exist (e.g. a stale token) it reports which one and we switch modes.
  const runSessionProbe = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await postVerify({});
      if (!response) return;
      if (response.ok) {
        const data = (await response.json()) as { validUntil: number };
        onSuccess(data.validUntil);
        return;
      }
      const data = (await response.json()) as { error?: string };
      if (data.error === 'mfa_required') {
        setMode('totp');
      } else {
        setMode('password');
      }
    } catch (err) {
      LOGGER.error(
        'StepUpModal: session probe error',
        err instanceof Error ? err : new Error(String(err)),
      );
      captureError(err instanceof Error ? err : new Error(String(err)));
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [postVerify, onSuccess]);

  useEffect(() => {
    if (mode === 'checking') void runSessionProbe();
    // Only re-run when entering `checking`; runSessionProbe is stable.
  }, [mode, runSessionProbe]);

  const handleVerify = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);

    try {
      const response = await postVerify(
        mode === 'totp' ? { code: trimmed } : { password: trimmed },
      );
      if (!response) return;

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
        'StepUpModal: verification error',
        err instanceof Error ? err : new Error(String(err)),
      );
      captureError(err instanceof Error ? err : new Error(String(err)));
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setMode((m) => (m === 'totp' ? 'password' : 'totp'));
    setValue('');
    setError(null);
  };

  const isChecking = mode === 'checking';

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      testID="step-up-modal"
    >
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback onPress={onDismiss} testID="step-up-backdrop">
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <YStack
          style={styles.card}
          borderRadius="$5"
          overflow="hidden"
          borderWidth={1}
          borderColor="$accentMuted"
          backgroundColor="$background"
        >
          {/* Header */}
          <XStack
            paddingHorizontal="$5"
            paddingVertical="$4"
            gap="$3"
            alignItems="center"
            backgroundColor="$brandNavy"
          >
            <Text fontSize={20}>🔒</Text>
            <YStack flex={1} gap="$0.5">
              <Paragraph size="$5" fontWeight="700" color="white">
                Confirm your identity
              </Paragraph>
              <Paragraph size="$2" color="white" opacity={0.7}>
                Re-authentication required for this action
              </Paragraph>
            </YStack>
          </XStack>

          {/* Body */}
          <YStack padding="$5" gap="$4">
            <Paragraph size="$3" color="$colorPress">
              {isChecking
                ? 'Confirming your identity…'
                : mode === 'totp'
                  ? 'Enter the 6-digit code from your authenticator app.'
                  : 'Enter your password to continue.'}
            </Paragraph>

            {isChecking ? (
              !error ? (
                <XStack
                  gap="$3"
                  alignItems="center"
                  paddingVertical="$2"
                  testID="step-up-checking"
                >
                  <Spinner size="small" color="$brandGold" />
                  <Paragraph size="$3" color="$colorPress">
                    Please wait…
                  </Paragraph>
                </XStack>
              ) : null
            ) : (
              <Input
                testID="step-up-input"
                value={value}
                onChangeText={setValue}
                placeholder={mode === 'totp' ? '6-digit code' : 'Password'}
                secureTextEntry={mode === 'password'}
                keyboardType={mode === 'totp' ? 'numeric' : 'default'}
                maxLength={mode === 'totp' ? 6 : undefined}
                autoFocus
                onSubmitEditing={() => void handleVerify()}
                accessibilityLabel={
                  mode === 'totp' ? 'Authenticator code' : 'Password'
                }
              />
            )}

            {error ? (
              <XStack
                gap="$2"
                padding="$3"
                borderRadius="$3"
                alignItems="flex-start"
                backgroundColor="$errorMuted"
                borderWidth={1}
                borderColor="$brandSeamRed"
              >
                <Text fontSize={14}>⚠️</Text>
                <Paragraph size="$2" color="$brandSeamRed" flex={1}>
                  {error}
                </Paragraph>
              </XStack>
            ) : null}

            <XStack gap="$3" justifyContent="space-between" alignItems="center">
              {isChecking ? (
                <YStack flex={1} />
              ) : (
                <Button
                  size="$2"
                  chromeless
                  onPress={toggleMode}
                  color="$brandGold"
                  testID="step-up-toggle-mode"
                >
                  {mode === 'totp'
                    ? 'Use password instead'
                    : 'Use authenticator'}
                </Button>
              )}

              <XStack gap="$2">
                <Button
                  size="$3"
                  onPress={onDismiss}
                  disabled={loading}
                  backgroundColor="$color3"
                  color="$color"
                  testID="step-up-cancel"
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
                      backgroundColor="$brandGold"
                      color="$brandNavy"
                      fontWeight="700"
                      testID="step-up-retry"
                    >
                      {loading ? 'Verifying…' : 'Try again'}
                    </Button>
                  ) : null
                ) : (
                  <Button
                    size="$3"
                    onPress={() => void handleVerify()}
                    disabled={loading || !value.trim()}
                    backgroundColor="$brandGold"
                    color="$brandNavy"
                    fontWeight="700"
                    testID="step-up-verify"
                  >
                    {loading ? 'Verifying…' : 'Verify'}
                  </Button>
                )}
              </XStack>
            </XStack>
          </YStack>
        </YStack>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'black',
    opacity: 0.65,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    zIndex: 1,
  },
});
