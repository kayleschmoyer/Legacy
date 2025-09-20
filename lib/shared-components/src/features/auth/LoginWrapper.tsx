/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from '../../platform-components';
import { safeStyle } from '../../utils/styles';

// Logger setup with fallback
let LOGGER: {
  info: (...args: unknown[]) => void;
};

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const logging = require('@legacy-sports/logging') as {
    LOGGER: {
      info: (...args: unknown[]) => void;
    };
  };
  LOGGER = logging.LOGGER;
} catch {
  // Fallback for test environment
  LOGGER = {
    info: (...args: unknown[]) => {
      // eslint-disable-next-line no-console
      console.info(...args);
    },
  };
}

export interface LoginWrapperProps {
  /**
   * Title text displayed at the top of the login form
   * @default 'Welcome to Legacy Sports!'
   */
  title?: string;
  /**
   * Placeholder text for email input
   * @default 'Email'
   */
  emailPlaceholder?: string;
  /**
   * Placeholder text for password input
   * @default 'Password'
   */
  passwordPlaceholder?: string;
  /**
   * Text for the login button
   * @default 'Login'
   */
  loginButtonText?: string;
  /**
   * Text for the registration link
   * @default "Don't have an account? Register here"
   */
  registerLinkText?: string;
  /**
   * Callback function called when login is attempted
   */
  onLogin?: (email: string, password: string) => Promise<void> | void;
  /**
   * Callback function called when register link is pressed
   */
  onRegister?: () => void;
  /**
   * External loading state (overrides internal loading)
   */
  isLoading?: boolean;
  /**
   * External error message (overrides internal error)
   */
  errorMessage?: string;
  /**
   * Custom styles for the container
   */
  containerStyle?: React.CSSProperties;
  /**
   * Custom styles for the title
   */
  titleStyle?: React.CSSProperties;
  /**
   * Custom styles for the login button
   */
  buttonStyle?: React.CSSProperties;
  /**
   * Animation duration in milliseconds
   * @default 500
   */
  animationDuration?: number;
}

function LoginWrapper({
  title = 'Welcome to Legacy Sports!',
  emailPlaceholder = 'Email',
  passwordPlaceholder = 'Password',
  loginButtonText = 'Login',
  registerLinkText = "Don't have an account? Register here",
  onLogin,
  onRegister,
  isLoading: externalLoading,
  errorMessage: externalError,
  containerStyle,
  titleStyle,
  buttonStyle,
  animationDuration = 500,
}: LoginWrapperProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [internalLoading, setInternalLoading] = useState(false);
  const [internalError, setInternalError] = useState('');
  const [fadeAnim] = useState(new Animated.Value(0));

  // Use external states if provided, otherwise use internal states
  const isLoading =
    externalLoading !== undefined ? externalLoading : internalLoading;
  const errorMessage =
    externalError !== undefined ? externalError : internalError;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      duration: animationDuration,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim, animationDuration]);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setInternalError('Please enter both email and password.');
      return;
    }

    setInternalLoading(true);
    setInternalError('');

    try {
      if (onLogin) {
        await onLogin(email, password);
      } else {
        // Default behavior - just log the attempt
        LOGGER.info('Login attempted with:', email);
        // Simulate API call
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      const errorMsg =
        error instanceof Error
          ? error.message
          : 'Login failed. Please check your credentials.';
      setInternalError(errorMsg);
    } finally {
      setInternalLoading(false);
    }
  };

  const handleRegister = () => {
    if (onRegister) {
      onRegister();
    } else {
      LOGGER.info('Register pressed');
    }
  };

  return (
    <KeyboardAvoidingView
      style={safeStyle([styles.container, containerStyle])}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Text style={safeStyle([styles.title, titleStyle])}>{title}</Text>

      <Animated.View style={safeStyle([styles.formContainer, { opacity: 1 }])}>
        <TextInput
          style={styles.input}
          placeholder={emailPlaceholder}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isLoading}
          placeholderTextColor="#999"
        />

        <TextInput
          style={styles.input}
          placeholder={passwordPlaceholder}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isLoading}
          placeholderTextColor="#999"
        />

        {errorMessage ? (
          <Text style={styles.errorMessage}>{errorMessage}</Text>
        ) : null}

        <TouchableOpacity
          style={[
            styles.loginButton,
            ...(buttonStyle ? [buttonStyle] : []),
            ...(isLoading ? [styles.loginButtonDisabled] : []),
          ]}
          onPress={() => void handleLogin()}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.loginButtonText}>{loginButtonText}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.registerLinkContainer}
          onPress={handleRegister}
          disabled={isLoading}
        >
          <Text
            style={safeStyle([
              styles.registerLinkText,
              isLoading && styles.disabledText,
            ])}
          >
            {registerLinkText.split('Register here')[0]}
            <Text
              style={safeStyle([
                styles.registerLink,
                isLoading && styles.disabledText,
              ])}
            >
              Register here
            </Text>
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#F8F9FA',
  },
  title: {
    fontSize: Platform.OS === 'web' ? 32 : 28,
    fontWeight: 'bold',
    marginBottom: 30,
    color: '#333',
    textAlign: 'center',
  },
  formContainer: {
    width: '100%',
    maxWidth: 400,
  },
  input: {
    borderColor: '#DDD',
    borderWidth: 1,
    borderRadius: 8,
    height: 50,
    marginBottom: 16,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
    color: '#333',
  },
  loginButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    marginTop: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  loginButtonDisabled: {
    backgroundColor: '#B0B0B0',
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  errorMessage: {
    color: '#FF3B30',
    marginBottom: 16,
    fontSize: 14,
    textAlign: 'center',
  },
  registerLinkContainer: {
    marginTop: 24,
    alignItems: 'center',
  },
  registerLinkText: {
    fontSize: 16,
    color: '#666',
  },
  registerLink: {
    color: '#007AFF',
    fontWeight: '600',
  },
  disabledText: {
    color: '#B0B0B0',
  },
});

export { LoginWrapper };
export default LoginWrapper;
