import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Circle,
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
      setIsLoading(true);
      setErrorMessage('');

      try {
        const { authResponse } = customEvent.detail;

        // Use AuthProvider's method if available, otherwise fallback to local auth service
        if (loginWithOAuth) {
          await loginWithOAuth(authResponse);
          // AuthProvider handles state management, call onSuccess with placeholder
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
      // Don't show error for One Tap failures - user can still use manual button
      console.error('One Tap authentication error:', customEvent.detail);
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
      // Get OAuth response from Google
      const oauthResponse = await OAuthProvider.signIn();

      // Use AuthProvider's method if available, otherwise fallback to local auth service
      if (loginWithOAuth) {
        await loginWithOAuth(oauthResponse);
        // AuthProvider handles state management, call onSuccess with placeholder
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
        overflow="hidden"
        style={[
          {
            minHeight: '100vh',
            maxWidth: '100vw',
            position: 'relative',
          },
          style,
        ]}
      >
        {/* Background decoration */}
        {!hideDecorations && (
          <>
            <Circle
              position="absolute"
              top={-50}
              right={-50}
              size={200}
              backgroundColor="$blue4"
              opacity={0.15}
            />
            <Circle
              position="absolute"
              bottom={-75}
              left={-75}
              size={250}
              backgroundColor="$purple4"
              opacity={0.1}
            />
            <Circle
              position="absolute"
              top="30%"
              left={-25}
              size={100}
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
          overflow="hidden"
          alignSelf="center"
          style={{
            maxWidth: `min(${cardMaxWidth}px, calc(100vw - 32px))`,
          }}
        >
          {shouldUseWideLayout ? (
            /* Wide layout for desktop - horizontal split */
            <XStack space="$8" alignItems="center" width="100%" overflow="hidden">
              {/* Left side - Branding */}
              <YStack space="$4" alignItems="center" flex={1} minWidth={200} maxWidth="50%">
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

                <YStack space="$2" alignItems="center" width="100%">
                  <Text fontSize="$8" fontWeight="bold" color="$color" textAlign="center">
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
              <YStack space="$5" flex={1} minWidth={250} maxWidth="50%">
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

                {/* Google login section */}
                <YStack space="$4" width="100%">
                  <Button
                    size="$5"
                    backgroundColor="white"
                    color="#1f1f1f"
                    fontWeight="500"
                    borderRadius="$4"
                    borderColor="#dadce0"
                    borderWidth={1}
                    disabled={!isConfigured || isLoading}
                    opacity={!isConfigured || isLoading ? 0.6 : 1}
                    onPress={() => {
                      void handleGoogleLogin();
                    }}
                    icon={
                      isLoading ? (
                        <Spinner size="small" color="#1f1f1f" />
                      ) : undefined
                    }
                    width="100%"
                    elevate
                    pressStyle={{ scale: 0.98, backgroundColor: '#f8f9fa' }}
                    hoverStyle={{ backgroundColor: '#f8f9fa', borderColor: '#c1c7cd' }}
                    animation="bouncy"
                  >
                    <XStack space="$3" alignItems="center" justifyContent="center" flex={1}>
                      {!isLoading && (
                        <svg width="18" height="18" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                      )}
                      <Text fontSize="$4" color="#1f1f1f" textAlign="center">
                        {isLoading ? 'Signing in...' : 'Sign in with Google'}
                      </Text>
                    </XStack>
                  </Button>
                </YStack>



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
            <YStack space="$5" alignItems="center" width="100%">
              {/* Header */}
              <YStack space="$3" alignItems="center" width="100%">
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

                <Text fontSize="$7" fontWeight="bold" color="$color" textAlign="center">
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

              {/* Google login section */}
              <YStack space="$4" width="100%">
                <Button
                  size="$5"
                  backgroundColor="white"
                  color="#1f1f1f"
                  fontWeight="500"
                  borderRadius="$4"
                  borderColor="#dadce0"
                  borderWidth={1}
                  disabled={!isConfigured || isLoading}
                  opacity={!isConfigured || isLoading ? 0.6 : 1}
                  onPress={() => {
                    void handleGoogleLogin();
                  }}
                  icon={
                    isLoading ? (
                      <Spinner size="small" color="#1f1f1f" />
                    ) : undefined
                  }
                  width="100%"
                  elevate
                  pressStyle={{ scale: 0.98, backgroundColor: '#f8f9fa' }}
                  hoverStyle={{ backgroundColor: '#f8f9fa', borderColor: '#c1c7cd' }}
                  animation="bouncy"
                >
                  <XStack space="$3" alignItems="center" justifyContent="center" flex={1}>
                    {!isLoading && (
                      <svg width="18" height="18" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                    )}
                    <Text fontSize="$4" color="#1f1f1f" textAlign="center">
                      {isLoading ? 'Signing in...' : 'Sign in with Google'}
                    </Text>
                  </XStack>
                </Button>
              </YStack>



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
