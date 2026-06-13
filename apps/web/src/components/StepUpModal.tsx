import React, { useState } from 'react';
import { Button, Input, Paragraph, Spinner, XStack, YStack } from 'tamagui';
import { AlertTriangle, Shield } from '@tamagui/lucide-icons';
import { LOGGER } from '@legacy-sports/logging';
import { useAuth } from '@legacy-sports/shared-components/auth';
import {
  AMBER,
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
 * user credential. Displays a TOTP input for MFA-enrolled users and a
 * password input for everyone else, with a toggle between the two modes.
 */
export function StepUpModal({ onSuccess, onDismiss }: StepUpModalProps) {
  const { config, user } = useAuth();
  const oauthProxyUrl = config.oauthProxyUrl ?? 'http://localhost:5001';

  const [mode, setMode] = useState<'totp' | 'password'>(
    user?.mfaEnabled ? 'totp' : 'password',
  );
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);

    const csrf = getCsrfToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (csrf) headers['X-CSRF-Token'] = csrf;

    const body =
      mode === 'totp'
        ? JSON.stringify({ code: trimmed })
        : JSON.stringify({ password: trimmed });

    try {
      const response = await fetch(`${oauthProxyUrl}/step-up/verify`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body,
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        if (data.error === 'mfa_not_enrolled' && mode === 'totp') {
          setMode('password');
          setValue('');
          setError('Authenticator not set up. Please use your password.');
        } else {
          setError('Incorrect credential. Please try again.');
        }
        return;
      }

      const data = (await response.json()) as { validUntil: number };
      onSuccess(data.validUntil);
    } catch (err) {
      LOGGER.error('StepUpModal: fetch error', { err });
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

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
            {mode === 'totp'
              ? 'Enter the 6-digit code from your authenticator app.'
              : 'Enter your password to continue.'}
          </Paragraph>

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
              <Paragraph
                size="$2"
                style={{ color: AMBER } as React.CSSProperties}
              >
                {error}
              </Paragraph>
            </XStack>
          )}

          <XStack gap="$3" justifyContent="space-between" alignItems="center">
            {/* Mode toggle */}
            <Button
              size="$2"
              chromeless
              onPress={() => {
                setMode((m) => (m === 'totp' ? 'password' : 'totp'));
                setValue('');
                setError(null);
              }}
              style={{ color: BRAND_GOLD } as React.CSSProperties}
            >
              {mode === 'totp'
                ? 'Use password instead'
                : user?.mfaEnabled
                  ? 'Use authenticator instead'
                  : null}
            </Button>

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
              <Button
                size="$3"
                onPress={() => void handleSubmit()}
                disabled={loading || !value.trim()}
                icon={loading ? <Spinner size="small" /> : undefined}
                style={
                  {
                    background: `linear-gradient(135deg, ${BRAND_GOLD} 0%, ${BRAND_GOLD}cc 100%)`,
                    color: '#0A0F1A',
                    fontWeight: '700',
                  } as React.CSSProperties
                }
              >
                {loading ? 'Verifying…' : 'Verify'}
              </Button>
            </XStack>
          </XStack>
        </YStack>
      </YStack>
    </YStack>
  );
}
