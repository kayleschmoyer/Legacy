import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Circle,
  Input,
  Separator,
  Spinner,
  Text,
  Theme,
  XStack,
  YStack,
} from 'tamagui';
import { AuthService } from './services/AuthService';
import { OAuthProvider } from '../../platform-components';
import type { OAuthConfig } from '../../platform-components/types';

// Type definitions for OAuth responses
interface OAuthResponse {
  credential?: string;
  clientId?: string;
  select_by?: string;
}

interface OneTapEventDetail {
  authResponse: OAuthResponse;
}

interface OneTapErrorEventDetail {
  error: Error | string;
}

interface LoginPageProps {
  /** OAuth configuration for Google */
  config: OAuthConfig;
  /** Callback when login is successful */
  onSuccess: (user: { id: number; email: string; name?: string }) => void;
  /** Callback when login fails */
  onError?: (error: Error) => void;
  /** Custom styling */
  style?: React.CSSProperties | Record<string, unknown>;
  /** App branding */
  appName?: string;
  /** App logo component */
  logo?: React.ReactNode;
  /** OAuth login method from AuthProvider (optional, for better state management) */
  loginWithOAuth?: (oauthResponse: OAuthResponse) => Promise<void>;
}

/**
 * Beautiful login page with sophisticated UI/UX
 * Integrates with both OAuth Proxy and User Manager lambdas
 *
 * Features:
 * - Elegant gradient design with subtle animations
 * - Social login with Google (primary)
 * - Email/password fallback option
 * - Cross-platform compatibility
 * - Modern loading states and error handling
 * - Accessible design with proper contrast
 * - Progressive enhancement
 */
export const LoginPage: React.FC<LoginPageProps> = ({
  config,
  onSuccess,
  onError,
  style,
  appName = 'Legacy Sports',
  logo,
  loginWithOAuth,
}) => {
  // State management
  const [isLoading, setIsLoading] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [authMethod, setAuthMethod] = useState<'social' | 'email'>('social');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Animation state for Tamagui
  const [isVisible, setIsVisible] = useState(false);

  // Initialize auth service with useMemo to prevent recreation
  const authService = useMemo(() => new AuthService(config), [config]);

  // Configure OAuth provider on mount
  useEffect(() => {
    const configureAuth = async () => {
      try {
        await OAuthProvider.configure(config);
        setIsConfigured(true);

        // Start entrance animation with simple visibility
        setTimeout(() => setIsVisible(true), 100);
      } catch (error) {
        console.error('Failed to configure OAuth:', error);
        setErrorMessage('Failed to initialize authentication');
        onError?.(
          error instanceof Error ? error : new Error('Configuration failed'),
        );
      }
    };

    void configureAuth();
  }, [config, onError]);

  // Listen for One Tap events (GSI automatic sign-in)
  useEffect(() => {
    const handleOneTapSuccess = async (event: Event) => {
      const customEvent = event as CustomEvent<OneTapEventDetail>;
      console.log('One Tap success event received');
      setIsLoading(true);
      setErrorMessage('');

      try {
        const { authResponse } = customEvent.detail;

        // Use AuthProvider's method if available, otherwise fallback to local auth service
        if (loginWithOAuth) {
          await loginWithOAuth(authResponse);
          // Extract user info for callback - in this case, we don't have the user object
          // The AuthProvider will handle state management, so we just call onSuccess with a placeholder
          onSuccess({ id: 0, email: 'authenticated@user.com' });
        } else {
          // Fallback to local auth service
          const user = await authService.authenticateWithOAuth(authResponse);
          onSuccess(user);
        }
      } catch (error) {
        console.error('One Tap authentication failed:', error);
        const errorMsg =
          error instanceof Error
            ? error.message
            : 'One Tap authentication failed';
        setErrorMessage(errorMsg);
        onError?.(error instanceof Error ? error : new Error(errorMsg));
      } finally {
        setIsLoading(false);
      }
    };

    const handleOneTapError = (event: Event) => {
      const customEvent = event as CustomEvent<OneTapErrorEventDetail>;
      console.log('One Tap error event received:', customEvent.detail);
      // Don't show error for One Tap failures - user can still use manual button
      // Just log it for debugging
    };

    // Create wrapper functions for event listeners to handle async properly
    const oneTapSuccessWrapper = (event: Event) => {
      void handleOneTapSuccess(event);
    };

    // Add event listeners for One Tap events
    window.addEventListener('gsi-one-tap-success', oneTapSuccessWrapper);
    window.addEventListener('gsi-one-tap-error', handleOneTapError);

    // Cleanup event listeners
    return () => {
      window.removeEventListener('gsi-one-tap-success', oneTapSuccessWrapper);
      window.removeEventListener('gsi-one-tap-error', handleOneTapError);
    };
  }, [authService, onSuccess, onError, loginWithOAuth]);

  // Handle Google OAuth login
  const handleGoogleLogin = useCallback(async () => {
    if (!isConfigured) {
      setErrorMessage('Authentication not ready');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      // Step 1: Get OAuth response from Google
      const oauthResponse = await OAuthProvider.signIn();

      // Step 2: Use AuthProvider's method if available, otherwise fallback to local auth service
      if (loginWithOAuth) {
        await loginWithOAuth(oauthResponse);
        // Extract user info for callback - in this case, we don't have the user object
        // The AuthProvider will handle state management, so we just call onSuccess with a placeholder
        onSuccess({ id: 0, email: 'authenticated@user.com' });
      } else {
        // Fallback to local auth service
        const user = await authService.authenticateWithOAuth(oauthResponse);
        onSuccess(user);
      }
    } catch (error) {
      console.error('Google login failed:', error);
      const errorMsg =
        error instanceof Error ? error.message : 'Google login failed';
      setErrorMessage(errorMsg);
      onError?.(error instanceof Error ? error : new Error(errorMsg));
    } finally {
      setIsLoading(false);
    }
  }, [isConfigured, onSuccess, onError, authService, loginWithOAuth]);

  // Handle email/password login
  const handleEmailLogin = useCallback(async () => {
    if (!email || !password) {
      setErrorMessage('Please enter both email and password');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const user = await authService.authenticateWithEmail(email, password);
      onSuccess(user);
    } catch (error) {
      console.error('Email login failed:', error);
      const errorMsg = error instanceof Error ? error.message : 'Login failed';
      setErrorMessage(errorMsg);
      onError?.(error instanceof Error ? error : new Error(errorMsg));
    } finally {
      setIsLoading(false);
    }
  }, [email, password, onSuccess, onError, authService]);

  // Simple animation styles using Tamagui
  const containerAnimation = {
    opacity: isVisible ? 1 : 0,
    y: isVisible ? 0 : 20,
    scale: isVisible ? 1 : 0.95,
    animation: 'bouncy',
  };

  return (
    <Theme name="light">
      <YStack
        flex={1}
        alignItems="center"
        justifyContent="center"
        padding="$4"
        style={[
          {
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            minHeight: '100vh',
          },
          style,
        ]}
      >
        {/* Background decoration */}
        <Circle
          position="absolute"
          top={-100}
          right={-100}
          size={300}
          backgroundColor="$blue4"
          opacity={0.1}
        />
        <Circle
          position="absolute"
          bottom={-150}
          left={-150}
          size={400}
          backgroundColor="$purple4"
          opacity={0.1}
        />

        {/* Main login card */}
        <Card
          elevate
          size="$4"
          bordered
          {...containerAnimation}
          hoverStyle={{ scale: 1.02 }}
          pressStyle={{ scale: 0.98 }}
          padding="$6"
          maxWidth={400}
          width="100%"
          backgroundColor="rgba(255, 255, 255, 0.95)"
          backdropFilter="blur(20px)"
          borderRadius="$6"
          shadowColor="rgba(0,0,0,0.1)"
          shadowOffset={{ width: 0, height: 10 }}
          shadowOpacity={0.3}
          shadowRadius={20}
        >
          <YStack space="$5" alignItems="center">
            {/* Header */}
            <YStack space="$3" alignItems="center">
              {logo || (
                <Circle size={80} backgroundColor="$blue10" elevate>
                  <Text fontSize="$8" color="white" fontWeight="bold">
                    {appName.charAt(0)}
                  </Text>
                </Circle>
              )}

              <Text fontSize="$7" fontWeight="bold" color="$gray12">
                Welcome to {appName}
              </Text>

              <Text fontSize="$4" color="$gray10" textAlign="center">
                Sign in to access your personalized sports experience
              </Text>
            </YStack>

            {/* Error message */}
            {errorMessage && (
              <Card backgroundColor="$red2" padding="$3" width="100%">
                <Text fontSize="$3" color="$red11" textAlign="center">
                  {errorMessage}
                </Text>
              </Card>
            )}

            {/* Social login section */}
            {authMethod === 'social' && (
              <YStack space="$4" width="100%">
                <Button
                  size="$5"
                  backgroundColor="$blue10"
                  color="white"
                  fontWeight="600"
                  borderRadius="$4"
                  disabled={!isConfigured || isLoading}
                  opacity={!isConfigured || isLoading ? 0.6 : 1}
                  onPress={() => {
                    void handleGoogleLogin();
                  }}
                  icon={
                    isLoading ? (
                      <Spinner size="small" color="white" />
                    ) : undefined
                  }
                  width="100%"
                  elevate
                  pressStyle={{ scale: 0.98 }}
                  animation="bouncy"
                >
                  <XStack space="$3" alignItems="center">
                    {!isLoading && (
                      <Text fontSize="$2">
                        <span role="img" aria-label="star">
                          🌟
                        </span>
                      </Text>
                    )}
                    <Text fontSize="$4" color="white">
                      {isLoading ? 'Signing in...' : 'Continue with Google'}
                    </Text>
                  </XStack>
                </Button>

                <XStack alignItems="center" space="$3">
                  <Separator flex={1} />
                  <Text fontSize="$2" color="$gray8">
                    or
                  </Text>
                  <Separator flex={1} />
                </XStack>

                <Button
                  size="$4"
                  variant="outlined"
                  color="$gray11"
                  borderColor="$gray6"
                  onPress={() => setAuthMethod('email')}
                  width="100%"
                >
                  Sign in with Email
                </Button>
              </YStack>
            )}

            {/* Email login section */}
            {authMethod === 'email' && (
              <YStack space="$4" width="100%">
                <YStack space="$3">
                  <Input
                    placeholder="Email address"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    size="$4"
                    borderRadius="$3"
                  />
                  <Input
                    placeholder="Password"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    size="$4"
                    borderRadius="$3"
                  />
                </YStack>

                <Button
                  size="$5"
                  backgroundColor="$purple10"
                  color="white"
                  fontWeight="600"
                  disabled={isLoading || !email || !password}
                  onPress={() => {
                    void handleEmailLogin();
                  }}
                  width="100%"
                  elevate
                  icon={
                    isLoading ? (
                      <Spinner size="small" color="white" />
                    ) : undefined
                  }
                >
                  {isLoading ? 'Signing in...' : 'Sign In'}
                </Button>

                <Button
                  size="$3"
                  variant="outlined"
                  color="$gray11"
                  onPress={() => {
                    setAuthMethod('social');
                    setErrorMessage('');
                  }}
                  width="100%"
                >
                  <span role="img" aria-label="arrow left">
                    ←
                  </span>{' '}
                  Back to Social Login
                </Button>
              </YStack>
            )}

            {/* Configuration status */}
            {!isConfigured && (
              <XStack space="$2" alignItems="center">
                <Spinner size="small" />
                <Text fontSize="$2" color="$gray10">
                  Initializing authentication...
                </Text>
              </XStack>
            )}
          </YStack>
        </Card>

        {/* Footer */}
        <Text
          fontSize="$2"
          color="rgba(255, 255, 255, 0.7)"
          textAlign="center"
          marginTop="$6"
        >
          Secure authentication powered by Google OAuth 2.0
        </Text>
      </YStack>
    </Theme>
  );
};

export default LoginPage;
