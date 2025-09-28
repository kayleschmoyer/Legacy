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
  /** Maximum width of the login card (default: 400 for mobile, 600 for desktop) */
  maxWidth?: number;
  /** Use wide layout for desktop screens */
  useWideLayout?: boolean;
  /** Hide background decorations for cleaner embedding */
  hideDecorations?: boolean;
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
  maxWidth,
  useWideLayout = false,
  hideDecorations = false,
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

  // Responsive breakpoint detection
  const [screenWidth, setScreenWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1024,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      setScreenWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Auto-detect wide layout based on screen size (768px is tablet breakpoint)
  const shouldUseWideLayout = useWideLayout || screenWidth >= 768;

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

  // Responsive layout calculations
  const cardMaxWidth = maxWidth || (shouldUseWideLayout ? 600 : 400);
  const cardPadding = shouldUseWideLayout ? '$8' : '$6';

  return (
    <Theme name="legacy_dark">
      <YStack
        flex={1}
        alignItems="center"
        justifyContent="center"
        padding="$4"
        backgroundColor="$background"
        style={[
          {
            minHeight: '100vh',
          },
          style,
        ]}
      >
        {/* Background decoration */}
        {!hideDecorations && (
          <>
            <Circle
              position="absolute"
              top={-100}
              right={-100}
              size={300}
              backgroundColor="$blue4"
              opacity={0.15}
            />
            <Circle
              position="absolute"
              bottom={-150}
              left={-150}
              size={400}
              backgroundColor="$purple4"
              opacity={0.1}
            />
            <Circle
              position="absolute"
              top="30%"
              left={-50}
              size={150}
              backgroundColor="$green4"
              opacity={0.08}
            />
          </>
        )}

        {/* Main login card */}
        <Card
          elevate
          size="$4"
          bordered
          {...containerAnimation}
          hoverStyle={{ scale: 1.02 }}
          pressStyle={{ scale: 0.98 }}
          padding={cardPadding}
          maxWidth={cardMaxWidth}
          width="100%"
          backgroundColor="$backgroundTransparent"
          borderRadius="$6"
          borderColor="$borderColor"
          borderWidth={1}
          shadowColor="$shadowColor"
          shadowOffset={{ width: 0, height: 20 }}
          shadowOpacity={0.6}
          shadowRadius={30}
        >
          {shouldUseWideLayout ? (
            /* Wide layout for desktop - horizontal split */
            <XStack space="$8" alignItems="center" width="100%">
              {/* Left side - Branding */}
              <YStack space="$4" alignItems="center" flex={1} minWidth={250}>
                {logo || (
                  <Circle
                    size={100}
                    backgroundColor="$blue6"
                    elevate
                    borderColor="$blue7"
                    borderWidth={2}
                  >
                    <Text fontSize="$9" color="$color" fontWeight="bold">
                      {appName.charAt(0)}
                    </Text>
                  </Circle>
                )}

                <YStack space="$2" alignItems="center">
                  <Text fontSize="$8" fontWeight="bold" color="$color">
                    Welcome to {appName}
                  </Text>
                  <Text
                    fontSize="$4"
                    color="$color11"
                    textAlign="center"
                    maxWidth={300}
                  >
                    Sign in to access your personalized sports experience and
                    track your favorite teams and players
                  </Text>
                </YStack>
              </YStack>

              {/* Right side - Login form */}
              <YStack space="$5" flex={1} minWidth={300}>
                {/* Error message */}
                {errorMessage && (
                  <Card
                    backgroundColor="$red2"
                    padding="$3"
                    width="100%"
                    borderColor="$red5"
                    borderWidth={1}
                  >
                    <Text fontSize="$3" color="$red10" textAlign="center">
                      {errorMessage}
                    </Text>
                  </Card>
                )}

                {/* Social login section */}
                {authMethod === 'social' && (
                  <YStack space="$4" width="100%">
                    <Button
                      size="$5"
                      backgroundColor="$blue6"
                      color="$color"
                      fontWeight="600"
                      borderRadius="$4"
                      borderColor="$blue7"
                      borderWidth={1}
                      disabled={!isConfigured || isLoading}
                      opacity={!isConfigured || isLoading ? 0.6 : 1}
                      onPress={() => {
                        void handleGoogleLogin();
                      }}
                      icon={
                        isLoading ? (
                          <Spinner size="small" color="$color" />
                        ) : undefined
                      }
                      width="100%"
                      elevate
                      pressStyle={{ scale: 0.98, backgroundColor: '$blue5' }}
                      hoverStyle={{ backgroundColor: '$blue7' }}
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
                        <Text fontSize="$4" color="$color">
                          {isLoading ? 'Signing in...' : 'Continue with Google'}
                        </Text>
                      </XStack>
                    </Button>

                    <XStack alignItems="center" space="$3">
                      <Separator flex={1} borderColor="$borderColor" />
                      <Text fontSize="$2" color="$color11">
                        or
                      </Text>
                      <Separator flex={1} borderColor="$borderColor" />
                    </XStack>

                    <Button
                      size="$4"
                      variant="outlined"
                      color="$color11"
                      borderColor="$borderColor"
                      backgroundColor="transparent"
                      hoverStyle={{ borderColor: '$borderColorHover' }}
                      pressStyle={{ scale: 0.98 }}
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
                        backgroundColor="$color2"
                        borderColor="$borderColor"
                        color="$color"
                        placeholderTextColor="$color11"
                      />
                      <Input
                        placeholder="Password"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                        size="$4"
                        borderRadius="$3"
                        backgroundColor="$color2"
                        borderColor="$borderColor"
                        color="$color"
                        placeholderTextColor="$color11"
                      />
                    </YStack>

                    <Button
                      size="$5"
                      backgroundColor="$purple6"
                      color="$color"
                      fontWeight="600"
                      borderColor="$purple7"
                      borderWidth={1}
                      disabled={isLoading || !email || !password}
                      onPress={() => {
                        void handleEmailLogin();
                      }}
                      width="100%"
                      elevate
                      hoverStyle={{ backgroundColor: '$purple7' }}
                      pressStyle={{ scale: 0.98 }}
                      icon={
                        isLoading ? (
                          <Spinner size="small" color="$color" />
                        ) : undefined
                      }
                    >
                      {isLoading ? 'Signing in...' : 'Sign In'}
                    </Button>

                    <Button
                      size="$3"
                      variant="outlined"
                      color="$color11"
                      borderColor="$borderColor"
                      backgroundColor="transparent"
                      hoverStyle={{ borderColor: '$borderColorHover' }}
                      pressStyle={{ scale: 0.98 }}
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
                    <Spinner size="small" color="$color11" />
                    <Text fontSize="$2" color="$color11">
                      Initializing authentication...
                    </Text>
                  </XStack>
                )}
              </YStack>
            </XStack>
          ) : (
            /* Standard vertical layout for mobile */
            <YStack space="$5" alignItems="center">
              {/* Header */}
              <YStack space="$3" alignItems="center">
                {logo || (
                  <Circle
                    size={80}
                    backgroundColor="$blue6"
                    elevate
                    borderColor="$blue7"
                    borderWidth={2}
                  >
                    <Text fontSize="$8" color="$color" fontWeight="bold">
                      {appName.charAt(0)}
                    </Text>
                  </Circle>
                )}

                <Text fontSize="$7" fontWeight="bold" color="$color">
                  Welcome to {appName}
                </Text>

                <Text fontSize="$4" color="$color11" textAlign="center">
                  Sign in to access your personalized sports experience
                </Text>
              </YStack>

              {/* Error message */}
              {errorMessage && (
                <Card
                  backgroundColor="$red2"
                  padding="$3"
                  width="100%"
                  borderColor="$red5"
                  borderWidth={1}
                >
                  <Text fontSize="$3" color="$red10" textAlign="center">
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
                  <Spinner size="small" color="$color11" />
                  <Text fontSize="$2" color="$color11">
                    Initializing authentication...
                  </Text>
                </XStack>
              )}
            </YStack>
          )}
        </Card>

        {/* Footer */}
        <Text fontSize="$2" color="$color11" textAlign="center" marginTop="$6">
          Secure authentication powered by Google OAuth 2.0
        </Text>
      </YStack>
    </Theme>
  );
};

export default LoginPage;
