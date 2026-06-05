import React from 'react';
import { Button, Card, Spinner, Text, Theme, XStack, YStack } from 'tamagui';
import { BrandIcon } from '../../components/icons';

export interface LoginPageProps {
  /** Called when the user presses the Google sign-in button */
  onGoogleSignIn: () => void;
  /** Called when the user presses the Discord sign-in button; omit to hide the button */
  onDiscordSignIn?: () => void;
  /**
   * Called when the user presses the "Sign in with Apple" button; omit to hide
   * the button. Required on iOS for App Store guideline 4.8 compliance.
   */
  onAppleSignIn?: () => void;
  /** Show spinner and disable the Google button while a Google sign-in is in flight */
  isGoogleLoading?: boolean;
  /** Show spinner and disable the Discord button while a Discord sign-in is in flight */
  isDiscordLoading?: boolean;
  /** Show spinner and disable the Apple button while an Apple sign-in is in flight */
  isAppleLoading?: boolean;
  /** Disable all auth buttons while the OAuth provider is initialising */
  isConfiguring?: boolean;
  /** Error text shown below the buttons */
  errorMessage?: string;
  /** Extra style forwarded to the card container */
  style?: React.CSSProperties | Record<string, unknown>;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onGoogleSignIn,
  onDiscordSignIn,
  onAppleSignIn,
  isGoogleLoading = false,
  isDiscordLoading = false,
  isAppleLoading = false,
  isConfiguring = false,
  errorMessage,
  style,
}) => {
  const anyLoading = isGoogleLoading || isDiscordLoading || isAppleLoading;
  const googleDisabled = anyLoading || isConfiguring;
  const discordDisabled = anyLoading;
  const appleDisabled = anyLoading || isConfiguring;

  return (
    <Theme name="legacy_dark">
      <Card
        position="relative"
        overflow="hidden"
        backgroundColor="#16223A"
        borderColor="rgba(255,255,255,0.08)"
        borderWidth={1}
        borderRadius={24}
        padding="$6"
        width="100%"
        style={style}
      >
        {/* Gold accent line at the top of the card */}
        <YStack
          position="absolute"
          top={0}
          left={24}
          right={24}
          height={2}
          backgroundColor="rgba(197,165,90,0.65)"
          borderRadius={2}
        />

        {/* Header */}
        <YStack alignItems="center" gap="$2" marginBottom="$6" marginTop="$1">
          <Text
            fontWeight="700"
            fontSize={10}
            letterSpacing={0.16}
            textTransform="uppercase"
            color="#9caac5"
          >
            Sign In
          </Text>
          <Text
            testID="login-title"
            fontWeight="800"
            fontSize={32}
            lineHeight={34}
            color="#ffffff"
            textAlign="center"
          >
            Step up to the plate
          </Text>
          <Text fontSize={15} color="#9caac5" textAlign="center">
            Use the account you already trust.
          </Text>
        </YStack>

        {/* OAuth buttons */}
        <YStack gap="$3">
          <Button
            testID="login-button"
            height={52}
            backgroundColor="white"
            borderColor="rgba(0,0,0,0.12)"
            borderWidth={1}
            borderRadius={12}
            disabled={googleDisabled}
            opacity={googleDisabled ? 0.7 : 1}
            onPress={onGoogleSignIn}
            aria-label="Continue with Google"
            pressStyle={{ backgroundColor: '#f4f4f5' }}
          >
            <XStack alignItems="center" gap="$3" flex={1}>
              {isGoogleLoading || isConfiguring ? (
                <Spinner size="small" color="#1f1f1f" />
              ) : (
                <BrandIcon name="google" size={20} decorative />
              )}
              <Text color="#1f1f1f" fontWeight="700" fontSize={14}>
                {isGoogleLoading
                  ? 'Connecting to Google…'
                  : isConfiguring
                    ? 'Preparing sign-in…'
                    : 'Continue with Google'}
              </Text>
            </XStack>
          </Button>

          {!!onDiscordSignIn && (
            <Button
              height={52}
              backgroundColor="#5865f2"
              borderColor="#4752c4"
              borderWidth={1}
              borderRadius={12}
              disabled={discordDisabled}
              opacity={discordDisabled ? 0.7 : 1}
              onPress={onDiscordSignIn}
              aria-label="Continue with Discord"
              pressStyle={{ backgroundColor: '#4752c4' }}
            >
              <XStack alignItems="center" gap="$3" flex={1}>
                {isDiscordLoading ? (
                  <Spinner size="small" color="white" />
                ) : (
                  <BrandIcon name="discord" size={20} decorative />
                )}
                <Text color="white" fontWeight="700" fontSize={14}>
                  {isDiscordLoading
                    ? 'Connecting to Discord…'
                    : 'Continue with Discord'}
                </Text>
              </XStack>
            </Button>
          )}

          {!!onAppleSignIn && (
            <Button
              testID="apple-login-button"
              height={52}
              backgroundColor="#000000"
              borderColor="rgba(255,255,255,0.18)"
              borderWidth={1}
              borderRadius={12}
              disabled={appleDisabled}
              opacity={appleDisabled ? 0.7 : 1}
              onPress={onAppleSignIn}
              aria-label="Sign in with Apple"
              pressStyle={{ backgroundColor: '#1a1a1a' }}
            >
              <XStack alignItems="center" gap="$3" flex={1}>
                {isAppleLoading ? (
                  <Spinner size="small" color="white" />
                ) : (
                  <BrandIcon name="apple" size={20} decorative />
                )}
                <Text color="white" fontWeight="700" fontSize={14}>
                  {isAppleLoading
                    ? 'Connecting to Apple…'
                    : 'Sign in with Apple'}
                </Text>
              </XStack>
            </Button>
          )}
        </YStack>

        {/* Error message */}
        {!!errorMessage && (
          <YStack
            testID="login-error"
            marginTop="$3"
            padding="$3"
            borderRadius={12}
            backgroundColor="rgba(196,30,58,0.12)"
            borderColor="rgba(196,30,58,0.35)"
            borderWidth={1}
          >
            <Text color="#e63950" fontSize={14} textAlign="center">
              {errorMessage}
            </Text>
          </YStack>
        )}

        {/* Legal */}
        <YStack
          marginTop="$5"
          paddingTop="$4"
          borderTopWidth={1}
          borderTopColor="#1f2d48"
        >
          <Text
            fontSize={12}
            color="#6c80ba"
            textAlign="center"
            lineHeight={18}
          >
            By continuing, you agree to our Terms of Service and Privacy Policy.
          </Text>
        </YStack>
      </Card>
    </Theme>
  );
};

export default LoginPage;
