import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Button, Input, Paragraph, Text, XStack, YStack } from 'tamagui';
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
}

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
}: StepUpModalProps): React.JSX.Element {
  const [mode, setMode] = useState<'password' | 'totp'>(
    mfaEnabled ? 'totp' : 'password',
  );
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);

    try {
      const { oauthProxyUrl } = getMobileOAuthConfig();
      if (!oauthProxyUrl) {
        setError('Authentication unavailable. Please try again later.');
        return;
      }

      const token = await readKeychainValue(Secret.INTERNAL_JWT);
      if (!token) {
        setError('Session expired. Please sign in again.');
        return;
      }

      const body =
        mode === 'totp'
          ? JSON.stringify({ code: trimmed })
          : JSON.stringify({ password: trimmed });

      const response = await fetch(`${oauthProxyUrl}/step-up/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body,
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        if (data.error === 'mfa_not_enrolled' && mode === 'totp') {
          setMode('password');
          setValue('');
          setError('Authenticator not set up. Please use your password.');
        } else if (data.error === 'no_password' && mode === 'password') {
          setMode('totp');
          setValue('');
          setError('No password set up. Please use your authenticator app.');
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
              {mode === 'totp'
                ? 'Enter the 6-digit code from your authenticator app.'
                : 'Enter your password to continue.'}
            </Paragraph>

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
              <Button
                size="$2"
                chromeless
                onPress={toggleMode}
                color="$brandGold"
                testID="step-up-toggle-mode"
              >
                {mode === 'totp' ? 'Use password instead' : 'Use authenticator'}
              </Button>

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
