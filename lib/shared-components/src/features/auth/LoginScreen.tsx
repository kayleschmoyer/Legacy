import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { DEFAULT_COLORS } from '../../config/sports';
import { useAuthHandlers } from './AuthHooks';

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
  containerStyle?: any;
  /**
   * Custom styles for the login button
   */
  buttonStyle?: any;
  /**
   * Custom text for the login button
   */
  buttonText?: string;
}

export function LoginScreen({
  onLoginSuccess,
  onLoginFailure,
  title = 'Welcome to Legacy Sports!',
  subtitle,
  containerStyle,
  buttonStyle,
  buttonText = 'Login with Google',
}: LoginScreenProps): JSX.Element {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(
    undefined
  );
  const [fadeAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    Animated.timing(fadeAnim, {
      duration: 500,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const { logout } = useAuthHandlers({
    onFailure: (err) => {
      setIsLoading(false);
      setErrorMessage(err);
      if (onLoginFailure) {
        onLoginFailure(err || 'Login failed');
      }
    },
    onSuccess: () => {
      setIsLoading(false);
      setErrorMessage(undefined);
      if (onLoginSuccess) {
        onLoginSuccess();
      }
    },
  });

  const handleLogin = () => {
    setIsLoading(true);
    setErrorMessage(undefined);
    // TODO: Implement alternative login method
    setErrorMessage('Login functionality needs to be implemented');
    setIsLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, containerStyle]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

        <Animated.View style={[styles.formContainer, { opacity: fadeAnim }]}>
          {errorMessage ? (
            <Text style={styles.errorMessage}>{errorMessage}</Text>
          ) : null}

          <TouchableOpacity
            style={[styles.loginButton, buttonStyle]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            <Text style={styles.loginButtonText}>{buttonText}</Text>
          </TouchableOpacity>

          {isLoading && (
            <ActivityIndicator
              size="large"
              color={DEFAULT_COLORS.primary}
              style={styles.loadingIndicator}
            />
          )}
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1E1E1E',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 10,
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }),
  },
  subtitle: {
    fontSize: 16,
    color: '#CCCCCC',
    marginBottom: 30,
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }),
  },
  formContainer: {
    width: '100%',
    maxWidth: 400,
  },
  errorMessage: {
    color: '#FF6B6B',
    marginBottom: 15,
    textAlign: 'center',
    fontSize: 14,
    ...(Platform.OS === 'web' && {
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }),
  },
  loginButton: {
    backgroundColor: '#4285F4',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }),
  },
  loadingIndicator: {
    marginTop: 20,
  },
});
