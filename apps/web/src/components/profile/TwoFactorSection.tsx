import React, { useCallback, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Input,
  Paragraph,
  Separator,
  Spinner,
  styled,
  XStack,
  YStack,
} from 'tamagui';
import { LOGGER } from '@legacy-sports/logging';
import type { UseMfaResult } from '@legacy-sports/shared-components/auth';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  EMERALD,
  EMERALD_DARK,
  GREEN,
  withAlpha,
} from '../../constants/colors';

/* ─── Styled Components ─── */

const ActionButton = styled(YStack, {
  paddingHorizontal: '$4',
  paddingVertical: '$2',
  borderRadius: '$4',
  cursor: 'pointer',
  alignItems: 'center',
  justifyContent: 'center',
  hoverStyle: { opacity: 0.85 },
  pressStyle: { scale: 0.97, opacity: 0.9 },
  animation: 'quick',
});

const StatusBadge = styled(XStack, {
  alignItems: 'center',
  gap: '$1.5',
  paddingHorizontal: '$3',
  paddingVertical: '$1',
  borderRadius: '$10',
  borderWidth: 1,
  variants: {
    enabled: {
      true: {
        backgroundColor: withAlpha(EMERALD, 0.15),
        borderColor: withAlpha(EMERALD, 0.4),
      },
      false: {
        backgroundColor: withAlpha(BG_DARK, 0.4),
        borderColor: '$glassBorder',
      },
    },
  } as const,
  defaultVariants: { enabled: false },
});

const SecretBox = styled(XStack, {
  padding: '$3',
  borderRadius: '$4',
  borderWidth: 1,
  borderColor: withAlpha(BRAND_NAVY_LIGHT, 0.4),
  backgroundColor: withAlpha(BG_DARK, 0.6),
  alignItems: 'center',
  gap: '$2',
  flexWrap: 'wrap',
});

/* ─── Helpers ─── */

function formatSecret(secret: string): string {
  return secret
    .toUpperCase()
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

/* ─── Component ─── */

export interface TwoFactorSectionProps {
  mfa: UseMfaResult;
}

const TwoFactorSection: React.FC<TwoFactorSectionProps> = ({ mfa }) => {
  const {
    mfaEnabled,
    isLoading,
    error,
    enrollData,
    startEnrollment,
    verifySetup,
    disable,
    cancelEnrollment,
    clearError,
  } = mfa;

  const [verifyCode, setVerifyCode] = useState('');
  const [copiedSecret, setCopiedSecret] = useState(false);

  const handleStartEnrollment = useCallback(() => {
    setVerifyCode('');
    void startEnrollment();
  }, [startEnrollment]);

  const handleVerify = useCallback(() => {
    if (verifyCode.trim().length === 0) return;
    void verifySetup(verifyCode.trim());
  }, [verifyCode, verifySetup]);

  const handleCancel = useCallback(() => {
    setVerifyCode('');
    cancelEnrollment();
  }, [cancelEnrollment]);

  const handleDisable = useCallback(() => {
    if (
      !window.confirm(
        'Disable two-factor authentication? Your account will be less secure.',
      )
    )
      return;
    void disable();
  }, [disable]);

  const handleCopySecret = useCallback(() => {
    if (!enrollData) return;
    navigator.clipboard.writeText(enrollData.secret).then(
      () => {
        setCopiedSecret(true);
        setTimeout(() => setCopiedSecret(false), 2000);
      },
      (err: unknown) => {
        LOGGER.error(
          'TwoFactorSection: failed to copy 2FA secret to clipboard',
          err instanceof Error ? err : new Error(String(err)),
        );
        setCopiedSecret(false);
      },
    );
  }, [enrollData]);

  if (mfaEnabled === null) {
    return (
      <XStack alignItems="center" justifyContent="center" padding="$4">
        <Spinner size="small" color="$colorPress" />
      </XStack>
    );
  }

  /* ── Enrollment flow ── */
  if (enrollData) {
    return (
      <YStack gap="$4" data-testid="2fa-enroll-flow">
        <Paragraph size="$3" color="$colorPress">
          Scan the QR code below with your authenticator app (Google
          Authenticator, Authy, 1Password, etc.), then enter the 6-digit code to
          activate 2FA.
        </Paragraph>

        {/* QR Code */}
        <YStack alignItems="center" gap="$3">
          <YStack
            padding="$3"
            borderRadius="$4"
            style={{ backgroundColor: '#ffffff' }}
          >
            <QRCodeSVG
              value={enrollData.otpauthUri}
              size={180}
              bgColor="#ffffff"
              fgColor="#000000"
              level="M"
              aria-label="Two-factor authentication QR code"
            />
          </YStack>

          {/* Manual secret */}
          <YStack gap="$1.5" width="100%">
            <Paragraph size="$2" color="$colorPress" fontWeight="500">
              Can&apos;t scan? Enter this code manually:
            </Paragraph>
            <SecretBox>
              <Paragraph
                size="$3"
                fontWeight="600"
                flex={1}
                style={{
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: 1,
                  wordBreak: 'break-all',
                  color: BRAND_GOLD_LIGHT,
                }}
              >
                {formatSecret(enrollData.secret)}
              </Paragraph>
              <ActionButton
                onPress={handleCopySecret}
                style={{
                  backgroundColor: copiedSecret
                    ? withAlpha(EMERALD, 0.3)
                    : withAlpha(BRAND_NAVY_LIGHT, 0.4),
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                }}
              >
                <Paragraph
                  size="$2"
                  fontWeight="600"
                  style={{ color: copiedSecret ? GREEN : BRAND_GOLD_LIGHT }}
                >
                  {copiedSecret ? 'Copied!' : 'Copy'}
                </Paragraph>
              </ActionButton>
            </SecretBox>
          </YStack>
        </YStack>

        <Separator />

        {/* Verification code input */}
        <YStack gap="$2">
          <Paragraph size="$3" color="$color" fontWeight="500">
            Enter the 6-digit code from your authenticator app:
          </Paragraph>
          <XStack gap="$2" alignItems="center">
            <Input
              aria-label="6-digit authenticator code"
              data-testid="2fa-code-input"
              value={verifyCode}
              onChangeText={(v: string) => {
                clearError();
                setVerifyCode(v.replace(/\D/g, '').slice(0, 6));
              }}
              placeholder="000000"
              maxLength={6}
              inputMode="numeric"
              flex={1}
              size="$4"
              borderColor={error ? BRAND_SEAM_RED : '$glassBorder'}
              onKeyPress={(e: { nativeEvent: { key: string } }) => {
                if (e.nativeEvent.key === 'Enter') handleVerify();
              }}
            />
            <ActionButton
              onPress={handleVerify}
              disabled={isLoading || verifyCode.length < 6}
              opacity={isLoading || verifyCode.length < 6 ? 0.5 : 1}
              role="button"
              aria-label="Verify and Enable 2FA"
              testID="2fa-verify-button"
              style={{ backgroundColor: EMERALD_DARK }}
            >
              {isLoading ? (
                <Spinner size="small" color="white" />
              ) : (
                <Paragraph size="$3" fontWeight="600" color="white">
                  Verify &amp; Enable
                </Paragraph>
              )}
            </ActionButton>
            <ActionButton
              onPress={handleCancel}
              disabled={isLoading}
              role="button"
              aria-label="Cancel 2FA enrollment"
              testID="2fa-cancel-button"
              style={{ backgroundColor: withAlpha(BG_DARK, 0.6) }}
            >
              <Paragraph size="$3" fontWeight="600" color="$colorPress">
                Cancel
              </Paragraph>
            </ActionButton>
          </XStack>
          {error ? (
            <Paragraph
              size="$2"
              role="alert"
              style={{ color: BRAND_SEAM_RED }}
              testID="2fa-error"
            >
              {error}
            </Paragraph>
          ) : null}
        </YStack>
      </YStack>
    );
  }

  /* ── Status view (enabled / disabled) ── */
  return (
    <YStack gap="$4" data-testid="2fa-status-view">
      <XStack
        alignItems="center"
        justifyContent="space-between"
        gap="$4"
        $sm={{ flexDirection: 'column', alignItems: 'flex-start' }}
      >
        <XStack alignItems="center" gap="$3" flex={1}>
          <YStack gap="$1">
            <XStack alignItems="center" gap="$2">
              <Paragraph size="$4" color="$color" fontWeight="600">
                Authenticator App (TOTP)
              </Paragraph>
              <StatusBadge enabled={mfaEnabled}>
                <YStack
                  width={7}
                  height={7}
                  borderRadius={4}
                  style={{ backgroundColor: mfaEnabled ? GREEN : '#6B7280' }}
                />
                <Paragraph
                  size="$2"
                  fontWeight="600"
                  style={{ color: mfaEnabled ? GREEN : '$colorPress' }}
                >
                  {mfaEnabled ? 'Enabled' : 'Not enabled'}
                </Paragraph>
              </StatusBadge>
            </XStack>
            <Paragraph size="$3" color="$colorPress">
              {mfaEnabled
                ? 'Your account is protected with a time-based one-time password.'
                : 'Use an authenticator app to generate codes at login.'}
            </Paragraph>
          </YStack>
        </XStack>

        {mfaEnabled ? (
          <ActionButton
            onPress={handleDisable}
            disabled={isLoading}
            opacity={isLoading ? 0.6 : 1}
            role="button"
            aria-label="Disable 2FA"
            testID="2fa-disable-button"
            style={{ backgroundColor: withAlpha(BRAND_SEAM_RED, 0.8) }}
          >
            {isLoading ? (
              <Spinner size="small" color="white" />
            ) : (
              <Paragraph size="$3" fontWeight="600" color="white">
                Disable 2FA
              </Paragraph>
            )}
          </ActionButton>
        ) : (
          <ActionButton
            onPress={handleStartEnrollment}
            disabled={isLoading}
            opacity={isLoading ? 0.6 : 1}
            role="button"
            aria-label="Enable 2FA"
            testID="2fa-enable-button"
            style={{
              background: `linear-gradient(135deg, ${BRAND_NAVY} 0%, ${BRAND_NAVY_LIGHT} 100%)`,
              borderWidth: 1,
              borderColor: withAlpha(BRAND_GOLD, 0.4),
            }}
          >
            {isLoading ? (
              <Spinner size="small" color={BRAND_GOLD_LIGHT} />
            ) : (
              <Paragraph
                size="$3"
                fontWeight="600"
                style={{ color: BRAND_GOLD_LIGHT }}
              >
                Enable 2FA
              </Paragraph>
            )}
          </ActionButton>
        )}
      </XStack>

      {error ? (
        <Paragraph
          size="$2"
          role="alert"
          style={{ color: BRAND_SEAM_RED }}
          testID="2fa-error"
        >
          {error}
        </Paragraph>
      ) : null}
    </YStack>
  );
};

export default TwoFactorSection;
