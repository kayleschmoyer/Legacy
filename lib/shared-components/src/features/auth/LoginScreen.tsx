/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import React, { useEffect, useState } from 'react';
import { Button, H2, Paragraph, Spinner, Text, YStack } from 'tamagui';
import { Animated, KeyboardAvoidingView } from 'react-native';
import { Platform } from '../../platform-components';
import { DEFAULT_COLORS } from '../../config/sports';

export interface LoginScreenProps {
  /**
   * Called when login is successful
   */
  onLoginSuccess?: () => void;
  /**
   * Called when login fails
   */
  onLoginFailure?: (error: string) => void;
  /**
   * Title text for the login screen
   */
  title?: string;
  /**
   * Subtitle text for the login screen
   */
  subtitle?: string;
  /**
   * Custom styles for the container
   */
  containerStyle?: React.CSSProperties;
  /**
   * Custom styles for the login button
   */
  buttonStyle?: React.CSSProperties;
  /**
   * Custom text for the login button
   */
  buttonText?: string;
}

function LoginScreen({
  onLoginSuccess,
  onLoginFailure,
  title = 'Welcome to Legacy Sports!',
  subtitle,
  containerStyle,
  buttonStyle,
  buttonText = 'Login with Google',
}: LoginScreenProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(
    undefined,
  );
  const [fadeAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    Animated.timing(fadeAnim, {
      duration: 500,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const handleLogin = () => {
    setIsLoading(true);
    setErrorMessage(undefined);
    // TODO: Implement alternative login method
    setErrorMessage('Login functionality needs to be implemented');
    setIsLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#1E1E1E' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <YStack flex={1} alignItems="center" justifyContent="center" padding="$4">
        <H2 color="white" marginBottom="$2" textAlign="center">
          {title}
        </H2>

        {subtitle && (
          <Paragraph color="$gray10" marginBottom="$6" textAlign="center">
            {subtitle}
          </Paragraph>
        )}

        <YStack width="100%" maxWidth={400} gap="$4">
          {errorMessage && (
            <Text color="$red10" textAlign="center" fontSize="$3">
              {errorMessage}
            </Text>
          )}

          <Button
            onPress={handleLogin}
            disabled={isLoading}
            backgroundColor="$blue9"
            borderRadius="$3"
            paddingVertical="$3"
            paddingHorizontal="$6"
            shadowColor="$shadowColor"
            shadowOffset={{ width: 0, height: 2 }}
            shadowOpacity={0.1}
            shadowRadius={4}
            elevation={2}
          >
            <Text color="white" fontSize="$4" fontWeight="600">
              {buttonText}
            </Text>
          </Button>

          {isLoading && (
            <YStack alignItems="center" marginTop="$4">
              <Spinner size="large" color={DEFAULT_COLORS.primary} />
            </YStack>
          )}
        </YStack>
      </YStack>
    </KeyboardAvoidingView>
  );
}

export { LoginScreen };
