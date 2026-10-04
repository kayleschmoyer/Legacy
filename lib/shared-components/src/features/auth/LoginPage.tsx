import React from 'react';
import {
  Anchor,
  Button,
  Card,
  Input,
  Spinner,
  Text,
  Theme,
  XStack,
  YStack,
} from 'tamagui';
import { BrandIcon } from '../../components/icons';

/**
 * How long an error banner stays visible before auto-dismissing, in ms.
 * Long enough to read a short sign-in error, short enough that a stale banner
 * does not linger after the user has moved on (LGN-027).
 */
const ERROR_AUTO_DISMISS_MS = 8000;

// Google's and Apple's own brand guidelines fix these buttons' colors
// regardless of app theme (Google: white bg / #1f1f1f text; Apple: black bg
// dark-mode "Sign in with Apple" button) — declared once here so the `card`
// and `fullBleed` variants below share a single literal instead of each
// re-declaring it (theme-compliance ratchet counts literal declaration
// sites, not usage sites).
const GOOGLE_BUTTON_TEXT_COLOR = '#1f1f1f';
const GOOGLE_BUTTON_PRESS_BG = '#f4f4f5';
const GOOGLE_BUTTON_BORDER = 'rgba(0,0,0,0.12)';
const APPLE_BUTTON_BG = '#000000';
const APPLE_BUTTON_PRESS_BG = '#1a1a1a';
const APPLE_BUTTON_BORDER = 'rgba(255,255,255,0.18)';

// Color set for the email/password form (LGN-017), one per variant. The
// `card` variant keeps its exact original literals (apps/web ships this
// today — must stay pixel-identical); `fullBleed` uses the new screen's
// semantic tokens. Extracted so EmailPasswordForm's JSX exists in one place
// instead of being duplicated per variant with drift risk (LS-9433 review).
interface EmailPasswordPalette {
  label: string;
  placeholder: string;
  inputBg: string;
  inputBorder: string;
  inputText: string;
  forgotPassword: string;
  submitBg: string;
  submitBorder: string;
  submitPressBg: string;
  submitText: string;
  dividerLine: string;
  dividerText: string;
}

const CARD_EMAIL_PASSWORD_PALETTE: EmailPasswordPalette = {
  label: '#9caac5',
  placeholder: '#8296ca',
  inputBg: '#0D1526',
  inputBorder: 'rgba(255,255,255,0.12)',
  inputText: '#ffffff',
  forgotPassword: '#C5A55A',
  submitBg: '#1B3A5C',
  submitBorder: '#274d77',
  submitPressBg: '#16314e',
  submitText: 'white',
  dividerLine: '#1f2d48',
  dividerText: '#8296ca',
};

const FULL_BLEED_EMAIL_PASSWORD_PALETTE: EmailPasswordPalette = {
  label: '$textMuted',
  placeholder: '$fg4',
  inputBg: '$surfaceSubtle',
  inputBorder: '$outlineSubtle',
  inputText: '$fg1',
  forgotPassword: '$brandGold',
  submitBg: '$brandNavy',
  submitBorder: '$brandNavyLight',
  submitPressBg: '$brandNavyDark',
  submitText: '$textOnAccent',
  dividerLine: '$outlineSubtle',
  dividerText: '$fg4',
};

interface LegalTextProps {
  termsUrl?: string;
  privacyUrl?: string;
  linkColor: string;
}

/**
 * Inline "Terms of Service" / "Privacy Policy" label. Renders as a real link
 * (`<a href>` on web, `Linking.openURL` on native via tamagui's Anchor) when
 * its URL is provided, so the policies are reachable from the logged-out
 * sign-in surface — the privacy policy is an app-store requirement (LS-10432).
 * Falls back to plain text when no URL is wired.
 */
function LegalLink({
  href,
  label,
  color,
  testID,
}: {
  href?: string;
  label: string;
  color: string;
  testID: string;
}): React.ReactNode {
  if (!href) return label;
  return (
    <Anchor
      testID={testID}
      href={href}
      color={color}
      fontSize={12}
      lineHeight={18}
      textDecorationLine="underline"
    >
      {label}
    </Anchor>
  );
}

function LegalText({
  termsUrl,
  privacyUrl,
  linkColor,
}: LegalTextProps): React.JSX.Element {
  return (
    <>
      By continuing, you agree to our{' '}
      <LegalLink
        href={termsUrl}
        label="Terms of Service"
        color={linkColor}
        testID="login-terms-link"
      />{' '}
      and{' '}
      <LegalLink
        href={privacyUrl}
        label="Privacy Policy"
        color={linkColor}
        testID="login-privacy-link"
      />
      .
    </>
  );
}

interface EmailPasswordFormProps {
  palette: EmailPasswordPalette;
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  onSubmit: () => void;
  anyLoading: boolean;
  isEmailPasswordLoading: boolean;
  emailPasswordDisabled: boolean;
  onForgotPassword?: () => void;
}

function EmailPasswordForm({
  palette,
  email,
  setEmail,
  password,
  setPassword,
  onSubmit,
  anyLoading,
  isEmailPasswordLoading,
  emailPasswordDisabled,
  onForgotPassword,
}: EmailPasswordFormProps): React.JSX.Element {
  return (
    <YStack gap="$3" marginBottom="$4">
      <YStack gap="$2">
        <Text
          fontWeight="700"
          fontSize={10}
          letterSpacing={0.16}
          textTransform="uppercase"
          color={palette.label}
        >
          Email
        </Text>
        <Input
          testID="login-email-input"
          aria-label="Email"
          value={email}
          onChangeText={setEmail}
          onSubmitEditing={onSubmit}
          disabled={anyLoading}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          placeholder="you@example.com"
          placeholderTextColor={palette.placeholder}
          height={48}
          backgroundColor={palette.inputBg}
          borderColor={palette.inputBorder}
          borderWidth={1}
          borderRadius={12}
          color={palette.inputText}
          fontSize={14}
        />
      </YStack>

      <YStack gap="$2">
        <Text
          fontWeight="700"
          fontSize={10}
          letterSpacing={0.16}
          textTransform="uppercase"
          color={palette.label}
        >
          Password
        </Text>
        <Input
          testID="login-password-input"
          aria-label="Password"
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={onSubmit}
          disabled={anyLoading}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="password"
          textContentType="password"
          placeholder="Enter your password"
          placeholderTextColor={palette.placeholder}
          height={48}
          backgroundColor={palette.inputBg}
          borderColor={palette.inputBorder}
          borderWidth={1}
          borderRadius={12}
          color={palette.inputText}
          fontSize={14}
        />
      </YStack>

      {!!onForgotPassword && (
        <Button
          testID="login-forgot-password"
          aria-label="Forgot password"
          onPress={onForgotPassword}
          unstyled
          alignSelf="flex-end"
          paddingVertical="$1"
        >
          <Text fontSize={12} color={palette.forgotPassword}>
            Forgot password?
          </Text>
        </Button>
      )}

      <Button
        testID="login-email-password-submit"
        height={52}
        backgroundColor={palette.submitBg}
        borderColor={palette.submitBorder}
        borderWidth={1}
        borderRadius={12}
        disabled={emailPasswordDisabled}
        opacity={emailPasswordDisabled ? 0.7 : 1}
        onPress={onSubmit}
        aria-label="Sign in with email and password"
        pressStyle={{ backgroundColor: palette.submitPressBg }}
      >
        <XStack alignItems="center" justifyContent="center" gap="$3">
          {isEmailPasswordLoading && (
            <Spinner size="small" color={palette.submitText} />
          )}
          <Text color={palette.submitText} fontWeight="700" fontSize={14}>
            {isEmailPasswordLoading ? 'Signing in…' : 'Sign In'}
          </Text>
        </XStack>
      </Button>

      {/* Divider between the form and the OAuth buttons */}
      <XStack alignItems="center" gap="$3" marginTop="$2">
        <YStack flex={1} height={1} backgroundColor={palette.dividerLine} />
        <Text
          fontSize={11}
          letterSpacing={0.12}
          textTransform="uppercase"
          color={palette.dividerText}
        >
          or continue with
        </Text>
        <YStack flex={1} height={1} backgroundColor={palette.dividerLine} />
      </XStack>
    </YStack>
  );
}

export interface LoginPageProps {
  /** Called when the user presses the Google sign-in button */
  onGoogleSignIn: () => void;
  /**
   * Called with the entered credentials when the user submits the
   * email/password form. Omit to hide the form entirely (e.g. mobile, which is
   * OAuth-only). When provided, an email + password form with a "Sign In"
   * button renders above the OAuth buttons (LGN-017).
   */
  onEmailPasswordSignIn?: (email: string, password: string) => void;
  /**
   * Called when the user presses the Discord sign-in button; omit to hide the
   * button. Only rendered in the `card` variant — the mobile `fullBleed`
   * variant never renders Discord regardless of this prop (LS-9433).
   */
  onDiscordSignIn?: () => void;
  /**
   * Called when the user presses the "Sign in with Apple" button; omit to hide
   * the button. Required on iOS for App Store guideline 4.8 compliance.
   */
  onAppleSignIn?: () => void;
  /** Show spinner and disable the Sign In button while an email/password sign-in is in flight */
  isEmailPasswordLoading?: boolean;
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
  /**
   * Called to clear the current error. When provided, the error banner renders
   * a dismiss (×) control and auto-dismisses after {@link ERROR_AUTO_DISMISS_MS}.
   * Omit to keep the banner persistent (no close button, no timer).
   */
  onDismissError?: () => void;
  /**
   * Called when the user presses "Forgot password?". Omit to hide the link.
   * Only rendered when `onEmailPasswordSignIn` is also provided — email/password
   * accounts are the only accounts that support password reset (LS-5521).
   */
  onForgotPassword?: () => void;
  /**
   * URL of the Terms of Service page. When provided, "Terms of Service" in the
   * legal line renders as a link (LS-10432). Native consumers must pass an
   * absolute URL.
   */
  termsUrl?: string;
  /**
   * URL of the Privacy Policy page. When provided, "Privacy Policy" in the
   * legal line renders as a link — required for app-store compliance
   * (LS-10432). Native consumers must pass an absolute URL.
   */
  privacyUrl?: string;
  /** Extra style forwarded to the root container */
  style?: React.CSSProperties | Record<string, unknown>;
  /**
   * Layout to render:
   * - `card` (default) — bounded card presentation embedded in a larger page
   *   (e.g. apps/web's landing/sign-in page). Supports Discord.
   * - `fullBleed` — full-screen mobile sign-in surface ("2a — Lifted Abstract",
   *   LS-9433): no card, brand lockup matching BrandedSplash, legal text
   *   pinned to the bottom via a flex spacer. Never renders Discord.
   */
  variant?: 'card' | 'fullBleed';
  /**
   * Extra content rendered below the sign-in buttons (and any error banner),
   * above the bottom-pinned legal text. `fullBleed` variant only — used by
   * consumers to compose in additional auth affordances (e.g. the mobile
   * biometric shortcut button) without duplicating this screen's layout.
   */
  children?: React.ReactNode;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onGoogleSignIn,
  onEmailPasswordSignIn,
  onDiscordSignIn,
  onAppleSignIn,
  isEmailPasswordLoading = false,
  isGoogleLoading = false,
  isDiscordLoading = false,
  isAppleLoading = false,
  isConfiguring = false,
  errorMessage,
  onDismissError,
  onForgotPassword,
  termsUrl,
  privacyUrl,
  style,
  variant = 'card',
  children,
}) => {
  const anyLoading =
    isEmailPasswordLoading ||
    isGoogleLoading ||
    isDiscordLoading ||
    isAppleLoading;
  const googleDisabled = anyLoading || isConfiguring;
  const discordDisabled = anyLoading;
  const appleDisabled = anyLoading || isConfiguring;

  // Email/password form state. Lives here so consumers only wire a single
  // onEmailPasswordSignIn(email, password) callback (mirrors the OAuth button
  // props). The form renders only when that callback is provided.
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');

  const emailPasswordSubmittable =
    email.trim().length > 0 && password.length > 0;
  const emailPasswordDisabled = anyLoading || !emailPasswordSubmittable;

  const handleEmailPasswordSubmit = React.useCallback(() => {
    if (!onEmailPasswordSignIn) return;
    const trimmedEmail = email.trim();
    // Guard against empty submissions and double-submits while a sign-in is in
    // flight — Enter-to-submit can fire while the button is already disabled.
    if (anyLoading || !trimmedEmail || !password) return;
    onEmailPasswordSignIn(trimmedEmail, password);
  }, [anyLoading, email, password, onEmailPasswordSignIn]);

  // Keep the latest dismiss callback in a ref so the auto-dismiss effect only
  // depends on the error text. Consumers commonly pass an inline arrow whose
  // identity changes every render; depending on it directly would restart the
  // timer on each render and the banner would never auto-dismiss.
  const dismissErrorRef = React.useRef(onDismissError);
  dismissErrorRef.current = onDismissError;

  // Auto-dismiss the error banner after a delay so a stale error does not
  // persist once the user has moved on (LGN-027). Gated on onDismissError so
  // consumers that opt out keep a persistent banner.
  React.useEffect(() => {
    if (!errorMessage || !dismissErrorRef.current) return;
    const timer = setTimeout(() => {
      dismissErrorRef.current?.();
    }, ERROR_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [errorMessage]);

  if (variant === 'fullBleed') {
    return (
      <Theme name="legacy_dark">
        <YStack
          flex={1}
          backgroundColor="$background"
          paddingTop={32}
          paddingHorizontal={28}
          paddingBottom={28}
          style={style}
        >
          {/* Brand block — mirrors BrandedSplash's lockup for cold-start → login continuity */}
          <YStack alignItems="center" gap={16} marginTop={96}>
            <YStack
              width={48}
              height={2}
              borderRadius={2}
              backgroundColor="$brandGold"
              opacity={0.65}
            />
            <Text
              testID="login-title"
              fontFamily="$heading"
              fontWeight="800"
              fontSize={44}
              lineHeight={44}
              letterSpacing={1}
              color="$brandGoldLight"
              textAlign="center"
            >
              LEGACY SPORTS
            </Text>
            <Text
              fontFamily="$body"
              fontStyle="italic"
              fontWeight="400"
              fontSize={15}
              color="$textMuted"
            >
              Where history plays on.
            </Text>
          </YStack>

          {/* Sign-in block */}
          <YStack gap={12} marginTop={56}>
            {/* Email/password form (LGN-017) — only when a handler is provided */}
            {!!onEmailPasswordSignIn && (
              <EmailPasswordForm
                palette={FULL_BLEED_EMAIL_PASSWORD_PALETTE}
                email={email}
                setEmail={setEmail}
                password={password}
                setPassword={setPassword}
                onSubmit={handleEmailPasswordSubmit}
                anyLoading={anyLoading}
                isEmailPasswordLoading={isEmailPasswordLoading}
                emailPasswordDisabled={emailPasswordDisabled}
                onForgotPassword={onForgotPassword}
              />
            )}

            <Text
              fontFamily="$body"
              fontWeight="700"
              fontSize={10}
              letterSpacing={1.6}
              textTransform="uppercase"
              color="$fg4"
              textAlign="center"
              marginBottom={4}
            >
              SIGN IN TO CONTINUE
            </Text>

            <Button
              testID="login-button"
              height={52}
              backgroundColor="white"
              borderColor={GOOGLE_BUTTON_BORDER}
              borderWidth={1}
              borderRadius={12}
              disabled={googleDisabled}
              opacity={googleDisabled ? 0.7 : 1}
              onPress={onGoogleSignIn}
              aria-label="Continue with Google"
              pressStyle={{ backgroundColor: GOOGLE_BUTTON_PRESS_BG }}
            >
              <XStack alignItems="center" justifyContent="center" gap="$3">
                {isGoogleLoading || isConfiguring ? (
                  <Spinner size="small" color={GOOGLE_BUTTON_TEXT_COLOR} />
                ) : (
                  <BrandIcon name="google" size={20} decorative />
                )}
                <Text
                  testID={
                    isGoogleLoading || isConfiguring
                      ? 'login-oauth-exchanging'
                      : undefined
                  }
                  color={GOOGLE_BUTTON_TEXT_COLOR}
                  fontWeight="700"
                  fontSize={14}
                >
                  {isGoogleLoading
                    ? 'Connecting to Google…'
                    : isConfiguring
                      ? 'Preparing sign-in…'
                      : 'Continue with Google'}
                </Text>
              </XStack>
            </Button>

            {!!onAppleSignIn && (
              <Button
                testID="apple-login-button"
                height={52}
                backgroundColor={APPLE_BUTTON_BG}
                borderColor={APPLE_BUTTON_BORDER}
                borderWidth={1}
                borderRadius={12}
                disabled={appleDisabled}
                opacity={appleDisabled ? 0.7 : 1}
                onPress={onAppleSignIn}
                aria-label="Sign in with Apple"
                pressStyle={{ backgroundColor: APPLE_BUTTON_PRESS_BG }}
              >
                <XStack alignItems="center" justifyContent="center" gap="$3">
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

            {/* Error message */}
            {!!errorMessage && (
              <XStack
                testID="login-error"
                padding="$3"
                borderRadius={12}
                backgroundColor="$statusDangerBg"
                borderColor="$statusDangerBorder"
                borderWidth={1}
                alignItems="center"
                gap="$2"
              >
                <Text
                  color="$statusDangerFg"
                  fontSize={14}
                  textAlign="center"
                  flex={1}
                >
                  {errorMessage}
                </Text>
                {!!onDismissError && (
                  <Button
                    testID="login-error-dismiss"
                    aria-label="Dismiss error"
                    onPress={onDismissError}
                    unstyled
                    padding="$1"
                    borderRadius={8}
                    hoverStyle={{ opacity: 0.7 }}
                    pressStyle={{ opacity: 0.5 }}
                  >
                    <BrandIcon
                      name="close"
                      size={16}
                      color="$statusDangerFg"
                      decorative
                    />
                  </Button>
                )}
              </XStack>
            )}

            {children}
          </YStack>

          {/* Flex spacer — pushes legal text to the bottom of the screen */}
          <YStack flex={1} />

          {/* Legal — no divider above it (unlike the card variant) */}
          <Text
            fontFamily="$body"
            fontSize={12}
            lineHeight={18}
            color="$fg4"
            textAlign="center"
          >
            <LegalText
              termsUrl={termsUrl}
              privacyUrl={privacyUrl}
              linkColor="$fg3"
            />
          </Text>
        </YStack>
      </Theme>
    );
  }

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
            Sign in or sign up
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

        {/* Email/password form (LGN-017) — only when a handler is provided */}
        {!!onEmailPasswordSignIn && (
          <EmailPasswordForm
            palette={CARD_EMAIL_PASSWORD_PALETTE}
            email={email}
            setEmail={setEmail}
            password={password}
            setPassword={setPassword}
            onSubmit={handleEmailPasswordSubmit}
            anyLoading={anyLoading}
            isEmailPasswordLoading={isEmailPasswordLoading}
            emailPasswordDisabled={emailPasswordDisabled}
            onForgotPassword={onForgotPassword}
          />
        )}

        {/* OAuth buttons */}
        <YStack gap="$3">
          <Button
            testID="login-button"
            height={52}
            backgroundColor="white"
            borderColor={GOOGLE_BUTTON_BORDER}
            borderWidth={1}
            borderRadius={12}
            disabled={googleDisabled}
            opacity={googleDisabled ? 0.7 : 1}
            onPress={onGoogleSignIn}
            aria-label="Continue with Google"
            pressStyle={{ backgroundColor: GOOGLE_BUTTON_PRESS_BG }}
          >
            <XStack alignItems="center" gap="$3" flex={1}>
              {isGoogleLoading || isConfiguring ? (
                <Spinner size="small" color={GOOGLE_BUTTON_TEXT_COLOR} />
              ) : (
                <BrandIcon name="google" size={20} decorative />
              )}
              <Text
                testID={
                  isGoogleLoading || isConfiguring
                    ? 'login-oauth-exchanging'
                    : undefined
                }
                color={GOOGLE_BUTTON_TEXT_COLOR}
                fontWeight="700"
                fontSize={14}
              >
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
              backgroundColor={APPLE_BUTTON_BG}
              borderColor={APPLE_BUTTON_BORDER}
              borderWidth={1}
              borderRadius={12}
              disabled={appleDisabled}
              opacity={appleDisabled ? 0.7 : 1}
              onPress={onAppleSignIn}
              aria-label="Sign in with Apple"
              pressStyle={{ backgroundColor: APPLE_BUTTON_PRESS_BG }}
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
          <XStack
            testID="login-error"
            marginTop="$3"
            padding="$3"
            borderRadius={12}
            backgroundColor="rgba(196,30,58,0.12)"
            borderColor="rgba(196,30,58,0.35)"
            borderWidth={1}
            alignItems="center"
            gap="$2"
          >
            <Text color="#e63950" fontSize={14} textAlign="center" flex={1}>
              {errorMessage}
            </Text>
            {!!onDismissError && (
              <Button
                testID="login-error-dismiss"
                aria-label="Dismiss error"
                onPress={onDismissError}
                unstyled
                padding="$1"
                borderRadius={8}
                hoverStyle={{ opacity: 0.7 }}
                pressStyle={{ opacity: 0.5 }}
              >
                <BrandIcon name="close" size={16} color="#e63950" decorative />
              </Button>
            )}
          </XStack>
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
            color="#8296ca"
            textAlign="center"
            lineHeight={18}
          >
            <LegalText
              termsUrl={termsUrl}
              privacyUrl={privacyUrl}
              linkColor={CARD_EMAIL_PASSWORD_PALETTE.label}
            />
          </Text>
        </YStack>
      </Card>
    </Theme>
  );
};

export default LoginPage;
