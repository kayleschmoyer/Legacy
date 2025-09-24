import React, { useCallback, useState } from 'react';
import { Button } from '@tamagui/button';
import { Text, XStack, YStack } from 'tamagui';
import { ActivityIndicator } from '../../platform-components';
import {
  OAuthErrorCode,
  OAuthProvider,
  PlatformUtils,
  SecureStorageProvider,
} from '../../platform-components';
import type {
  OAuthConfig,
  OAuthError,
  OAuthResponse,
} from '../../platform-components';

interface OAuthLoginProps {
  /** OAuth configuration for Google */
  config: OAuthConfig;
  /** Callback when login is successful */
  onSuccess: (response: OAuthResponse) => void;
  /** Callback when login fails */
  onError?: (error: OAuthError) => void;
  /** Custom styling for the button */
  style?: React.CSSProperties | Record<string, unknown>;
  /** Whether to show loading state */
  loading?: boolean;
  /** Custom button text */
  buttonText?: string;
  /** Whether the component is disabled */
  disabled?: boolean;
}

/**
 * Modern OAuth Login Component for Google authentication
 * Supports both web and mobile platforms with clean, type-safe interfaces
 *
 * Features:
 * - Google OAuth integration via existing oauth-proxy lambda
 * - Cross-platform support (web React + mobile React Native)
 * - Secure token storage with platform-specific implementations
 * - Modern UI with Tamagui components
 * - TypeScript support with comprehensive error handling
 * - Clean architecture with platform-specific wrappers
 */
export const OAuthLoginComponent: React.FC<OAuthLoginProps> = ({
  config,
  onSuccess,
  onError,
  style,
  loading: externalLoading = false,
  buttonText = 'Sign in with Google',
  disabled = false,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);

  // Configure OAuth provider on mount
  React.useEffect(() => {
    const configureOAuth = async () => {
      try {
        await OAuthProvider.configure(config);
        setIsConfigured(true);
      } catch (error) {
        console.error('Failed to configure OAuth:', error);
        onError?.({
          code: OAuthErrorCode.CONFIGURATION_ERROR,
          message: 'Failed to configure OAuth provider',
          originalError: error,
        });
      }
    };

    void configureOAuth();
  }, [config, onError]);

  const handleSignIn = useCallback(async () => {
    if (!isConfigured) {
      onError?.({
        code: OAuthErrorCode.CONFIGURATION_ERROR,
        message: 'OAuth provider not configured',
      });
      return;
    }

    setIsLoading(true);

    try {
      // Attempt OAuth sign-in
      const response = await OAuthProvider.signIn();

      // Check if we got valid OAuth response data
      if (response.code || response.credential || response.serverAuthCode) {
        // Store the OAuth response data
        if (response.code) {
          await SecureStorageProvider.setItem('oauth_auth_code', response.code);
        }

        if (response.credential) {
          await SecureStorageProvider.setItem(
            'oauth_credential',
            response.credential,
          );
        }

        if (response.serverAuthCode) {
          await SecureStorageProvider.setItem(
            'oauth_server_auth_code',
            response.serverAuthCode,
          );
        }

        // Store user info if available
        if (response.user) {
          await SecureStorageProvider.setItem(
            'oauth_user_info',
            JSON.stringify(response.user),
          );
        }

        onSuccess(response);
      } else {
        throw new Error('Sign-in failed - no valid OAuth response received');
      }
    } catch (error: unknown) {
      console.error('OAuth sign-in error:', error);

      // Safely parse error
      let errorCode = OAuthErrorCode.UNKNOWN_ERROR;
      let errorMessage = 'Failed to sign in with Google';

      if (error && typeof error === 'object') {
        const errorObj = error as { code?: string; message?: string };
        if (
          errorObj.code &&
          Object.values(OAuthErrorCode).includes(
            errorObj.code as OAuthErrorCode,
          )
        ) {
          errorCode = errorObj.code as OAuthErrorCode;
        }
        if (errorObj.message && typeof errorObj.message === 'string') {
          errorMessage = errorObj.message;
        }
      }

      const oauthError: OAuthError = {
        code: errorCode,
        message: errorMessage,
        originalError: error,
      };

      // Use platform-specific error handling
      PlatformUtils.handleOAuthError?.(oauthError);

      onError?.(oauthError);
    } finally {
      setIsLoading(false);
    }
  }, [isConfigured, onSuccess, onError]);

  const isLoadingState = isLoading || externalLoading;
  const isDisabled = disabled || isLoadingState || !isConfigured;

  return (
    /* eslint-disable-next-line @typescript-eslint/no-unsafe-assignment */
    <YStack space="$4" alignItems="center" style={style}>
      <Button
        size="$4"
        theme="blue"
        backgroundColor="$blue10"
        color="white"
        borderRadius="$4"
        paddingHorizontal="$6"
        paddingVertical="$3"
        disabled={isDisabled}
        opacity={isDisabled ? 0.6 : 1}
        onPress={handleSignIn}
        icon={
          isLoadingState ? (
            <ActivityIndicator size="small" color="white" />
          ) : undefined
        }
        {...(PlatformUtils?.getInteractiveButtonProps?.(isDisabled) || {})}
      >
        <XStack space="$2" alignItems="center">
          {!isLoadingState && (
            <Text fontSize="$4" fontWeight="600" color="white">
              {buttonText}
            </Text>
          )}
          {isLoadingState && (
            <Text fontSize="$4" fontWeight="600" color="white">
              Signing in...
            </Text>
          )}
        </XStack>
      </Button>

      {!isConfigured && (
        <Text fontSize="$2" color="$red10">
          Configuring OAuth...
        </Text>
      )}
    </YStack>
  );
};

export default OAuthLoginComponent;
