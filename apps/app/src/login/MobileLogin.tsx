import React, { useState } from 'react';
import { Platform } from 'react-native';
import { LOGGER } from '@legacy-sports/logging';
import { KeyboardAvoidingView } from 'react-native';
import { Button, Text, YStack } from 'tamagui';
import {
  AuthProvider,
  LoginPage,
  OAuthConfig,
  useAuth,
} from '@legacy-sports/shared-components';

// Type for authenticated user
interface AuthenticatedUser {
  id: number;
  email: string;
  username?: string;
  name?: string;
}

const MobileLogin: React.FC = () => {
  const [debugInfo, setDebugInfo] = useState<string>('');

  // OAuth configuration for mobile
  const oauthConfig: OAuthConfig = {
    googleClientId: 'your-google-client-id', // This should come from env
    additionalScopes: ['openid', 'profile', 'email'],
    offlineAccess: true,
  };

  const handleLoginSuccess = (user: AuthenticatedUser) => {
    LOGGER.info('Mobile authentication successful:', user);
    setDebugInfo(`Welcome ${user.username || user.email}!`);
    // Navigate to main app screen here
  };

  const handleLoginError = (error: Error) => {
    LOGGER.error('Mobile authentication failed:', String(error));
    setDebugInfo(`Login failed: ${error.message}`);
  };

  return (
    <AuthProvider config={oauthConfig}>
      <MobileLoginContent
        config={oauthConfig}
        onSuccess={handleLoginSuccess}
        onError={handleLoginError}
        debugInfo={debugInfo}
        onClearDebug={() => setDebugInfo('')}
      />
    </AuthProvider>
  );
};

interface MobileLoginContentProps {
  config: OAuthConfig;
  onSuccess: (user: AuthenticatedUser) => void;
  onError: (error: Error) => void;
  debugInfo: string;
  onClearDebug: () => void;
}

const MobileLoginContent: React.FC<MobileLoginContentProps> = ({
  config: _config,
  onSuccess: _onSuccess,
  onError,
  debugInfo,
  onClearDebug,
}) => {
  const auth = useAuth();

  const handleLogout = async () => {
    try {
      await auth.logout();
    } catch (error) {
      onError(error instanceof Error ? error : new Error('Logout failed'));
    }
  };

  // Show authenticated state
  if (auth.isAuthenticated && auth.user) {
    return (
      <KeyboardAvoidingView
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
        }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <YStack space="$4" alignItems="center" width="100%">
          <Text fontSize="$8" fontWeight="bold" textAlign="center">
            Welcome Back!{' '}
            <span role="img" aria-label="celebration">
              🎉
            </span>
          </Text>

          <YStack space="$2" alignItems="center">
            <Text fontSize="$5">Hello, {auth.user.username}!</Text>
            <Text fontSize="$3" color="$gray10">
              Email: {auth.user.email}
            </Text>
            <Text fontSize="$3" color="$gray10">
              Access: {auth.user.accessLevel}
            </Text>
          </YStack>

          <Button
            size="$4"
            theme="red"
            onPress={handleLogout}
            disabled={auth.isLoading}
            width="80%"
          >
            {auth.isLoading ? 'Signing out...' : 'Sign Out'}
          </Button>

          {debugInfo && (
            <YStack
              space="$2"
              padding="$3"
              backgroundColor="$gray2"
              borderRadius="$4"
            >
              <Text fontSize="$2" textAlign="center">
                {debugInfo}
              </Text>
              <Button size="$2" variant="outlined" onPress={onClearDebug}>
                Clear
              </Button>
            </YStack>
          )}
        </YStack>
      </KeyboardAvoidingView>
    );
  }

  // Show modern login page
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LoginPage
        onGoogleSignIn={() => {
          auth
            .loginWithProvider()
            .then(() => {
              /* success handled by AuthProvider */
            })
            .catch(onError);
        }}
        style={{ flex: 1 }}
      />

      {debugInfo && (
        <YStack
          position="absolute"
          bottom={50}
          left={20}
          right={20}
          padding="$3"
          backgroundColor="rgba(0,0,0,0.8)"
          borderRadius="$4"
          space="$2"
        >
          <Text
            fontSize="$3"
            fontWeight="bold"
            color="white"
            textAlign="center"
          >
            Debug Info:
          </Text>
          <Text fontSize="$2" color="white" textAlign="center">
            {debugInfo}
          </Text>
          <Button size="$2" variant="outlined" onPress={onClearDebug}>
            Clear
          </Button>
        </YStack>
      )}
    </KeyboardAvoidingView>
  );
};

export default MobileLogin;
