import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { Button, Spinner, Text, Theme, YStack } from 'tamagui';
import { LoginPage, useAuth } from '@legacy-sports/shared-components';
import { LOGGER } from '@legacy-sports/logging';
import { useAuthHandlers } from '../common/auth/AuthHooks';
import { isAppleAuthAvailable } from '../common/auth/appleAuth';
import { resolvePostLoginDestination } from '../common/auth/postLoginDestination';
import { getLastVisitedLeague } from '../common/utilities/lastVisitedLeague';
import { getMobileOAuthConfig } from '../common/auth/mobileOAuthConfig';
import {
  type BiometricState,
  checkBiometricState,
  getStoredJwtIfValid,
  promptBiometric,
  storeJwtForBiometric,
} from '../common/auth/BiometricAuth';

const BG_DEEP_NAVY = '#0A0F1A';

const Login: React.FC = () => {
  const router = useRouter();
  // The guard renders this screen in place at the deep-linked route, so the
  // current pathname is the destination to return to after login (LGN-037).
  const pathname = usePathname();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);
  const [isDiscordLoading, setIsDiscordLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(
    undefined,
  );

  // Biometric state
  const [biometricState, setBiometricState] = useState<BiometricState | null>(
    null,
  );
  const [isBiometricLoading, setIsBiometricLoading] = useState(false);
  // Prevent auto-prompt from firing more than once per mount.
  const autoPromptFiredRef = useRef(false);

  const { loginWithToken, isAuthenticated, token } = useAuth();

  // After any successful OAuth login, persist the JWT to secure storage so
  // subsequent cold starts can offer the biometric shortcut.
  useEffect(() => {
    if (!isAuthenticated || !token) return;
    void storeJwtForBiometric(token);
  }, [isAuthenticated, token]);

  // Discord login is gated on a configured client ID, mirroring the web app.
  // The config is static at module load, so resolve availability once.
  const discordAvailable = !!getMobileOAuthConfig().discordClientId;

  // Apple App Store guideline 4.8 requires "Sign in with Apple" wherever a
  // third-party social login is offered. The native framework is only present
  // on iOS, so gate the button on its availability.
  useEffect(() => {
    let active = true;
    if (Platform.OS === 'ios') {
      void isAppleAuthAvailable().then((available) => {
        if (active) {
          setAppleAvailable(available);
        }
      });
    }
    return () => {
      active = false;
    };
  }, []);

  // Check biometric availability and stored token on mount.
  useEffect(() => {
    let isMounted = true;
    void checkBiometricState().then((state) => {
      if (isMounted) setBiometricState(state);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // Resolve where to land after login. An explicit deep-link destination
  // (the route the guard rendered this screen in place at) wins (LGN-037);
  // otherwise fall back to the user's last-opened league, then the home
  // screen (LS-6694).
  const redirectAfterLogin = useCallback(async () => {
    const deepLink = resolvePostLoginDestination(pathname);
    if (deepLink !== '/') {
      router.replace(deepLink as Href);
      return;
    }
    const last = await getLastVisitedLeague();
    if (last) {
      router.replace({
        pathname:
          last.sport === 'football'
            ? '/football/league/[leagueId]'
            : '/baseball/league/[leagueId]',
        params: { leagueId: String(last.leagueId) },
      });
      return;
    }
    router.replace('/');
  }, [router, pathname]);

  const { googleLogin, appleLogin, discordLogin } = useAuthHandlers({
    onFailure: (err) => {
      setIsGoogleLoading(false);
      setIsAppleLoading(false);
      setIsDiscordLoading(false);
      setErrorMessage(err);
    },
    onSuccess: () => {
      setIsGoogleLoading(false);
      setIsAppleLoading(false);
      setIsDiscordLoading(false);
      void redirectAfterLogin();
    },
  });

  const handleGoogleSignIn = () => {
    setErrorMessage(undefined);
    setIsGoogleLoading(true);
    void googleLogin();
  };

  const handleAppleSignIn = () => {
    setErrorMessage(undefined);
    setIsAppleLoading(true);
    void appleLogin();
  };

  const handleDiscordSignIn = () => {
    setErrorMessage(undefined);
    setIsDiscordLoading(true);
    void discordLogin();
  };

  const handleBiometricSignIn = useCallback(async () => {
    setIsBiometricLoading(true);
    setErrorMessage(undefined);
    try {
      const success = await promptBiometric();
      if (!success) return;
      const storedJwt = await getStoredJwtIfValid();
      if (!storedJwt) {
        setErrorMessage('Session expired. Please sign in again.');
        return;
      }
      await loginWithToken(storedJwt);
      void redirectAfterLogin();
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Biometric sign-in failed';
      LOGGER.warn(
        'Login: biometric auth failed',
        error instanceof Error ? error : new Error(msg),
      );
      setErrorMessage(msg);
    } finally {
      setIsBiometricLoading(false);
    }
  }, [loginWithToken, redirectAfterLogin]);

  // Auto-trigger biometric prompt once on cold start when conditions are met.
  useEffect(() => {
    if (
      biometricState === null ||
      autoPromptFiredRef.current ||
      !biometricState.hasHardware ||
      !biometricState.isEnrolled ||
      !biometricState.hasStoredToken
    ) {
      return;
    }
    autoPromptFiredRef.current = true;
    void handleBiometricSignIn();
  }, [biometricState, handleBiometricSignIn]);

  const canUseBiometric =
    biometricState?.hasHardware &&
    biometricState.isEnrolled &&
    biometricState.hasStoredToken;

  const isAnyLoading =
    isGoogleLoading || isAppleLoading || isDiscordLoading || isBiometricLoading;

  return (
    <Theme name="legacy_dark">
      {/* This OAuth-only screen has no text inputs, so it never raises a soft
          keyboard — a KeyboardAvoidingView wrapper would be dead code. Per
          LS-6656 the app is OAuth-only (no email/password parity to autofill),
          so a plain layout container is used here. */}
      <YStack
        testID="login-screen"
        flex={1}
        justifyContent="center"
        padding="$5"
        backgroundColor={BG_DEEP_NAVY}
        gap="$4"
      >
        <LoginPage
          onGoogleSignIn={handleGoogleSignIn}
          onAppleSignIn={appleAvailable ? handleAppleSignIn : undefined}
          onDiscordSignIn={discordAvailable ? handleDiscordSignIn : undefined}
          isGoogleLoading={isGoogleLoading}
          isAppleLoading={isAppleLoading}
          isDiscordLoading={isDiscordLoading}
          errorMessage={errorMessage}
        />

        {canUseBiometric ? (
          <Button
            testID="biometric-login-button"
            height={52}
            backgroundColor="#1B3A5C"
            borderColor="rgba(197,165,90,0.4)"
            borderWidth={1}
            borderRadius={12}
            disabled={isAnyLoading}
            opacity={isAnyLoading ? 0.7 : 1}
            onPress={() => {
              void handleBiometricSignIn();
            }}
            aria-label="Sign in with biometrics"
            pressStyle={{ backgroundColor: '#163249' }}
          >
            {isBiometricLoading ? (
              <Spinner size="small" color="#C5A55A" />
            ) : (
              <Text color="#C5A55A" fontWeight="700" fontSize={14}>
                Sign in with Face ID / Fingerprint
              </Text>
            )}
          </Button>
        ) : null}
      </YStack>
    </Theme>
  );
};

export default Login;
