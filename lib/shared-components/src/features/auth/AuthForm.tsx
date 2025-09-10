import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Platform,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
} from '../../platform-components';
import { DEFAULT_COLORS } from '../../config/sports';
import { User, AuthState } from '../../types';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData extends LoginCredentials {
  name: string;
  confirmPassword: string;
}

export interface AuthFormProps {
  onLogin: (credentials: LoginCredentials) => Promise<void>;
  onRegister?: (data: RegisterData) => Promise<void>;
  onForgotPassword?: (email: string) => Promise<void>;
  loading?: boolean;
  error?: string | null;
  initialMode?: 'login' | 'register';
}

export function AuthForm({
  onLogin,
  onRegister,
  onForgotPassword,
  loading = false,
  error = null,
  initialMode = 'login',
}: AuthFormProps): JSX.Element {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>(
    initialMode
  );
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(50));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        duration: 600,
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        duration: 600,
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  useEffect(() => {
    if (error) {
      if (Platform.OS === 'web') {
        alert(error);
      } else {
        Alert.alert('Error', error);
      }
    }
  }, [error]);

  const validateForm = (): boolean => {
    if (!formData.email.trim()) {
      const message = 'Please enter your email';
      Platform.OS === 'web' ? alert(message) : Alert.alert('Error', message);
      return false;
    }

    if (!formData.email.includes('@')) {
      const message = 'Please enter a valid email address';
      Platform.OS === 'web' ? alert(message) : Alert.alert('Error', message);
      return false;
    }

    if (mode !== 'forgot' && !formData.password.trim()) {
      const message = 'Please enter your password';
      Platform.OS === 'web' ? alert(message) : Alert.alert('Error', message);
      return false;
    }

    if (mode === 'register') {
      if (!formData.name.trim()) {
        const message = 'Please enter your name';
        Platform.OS === 'web' ? alert(message) : Alert.alert('Error', message);
        return false;
      }

      if (formData.password.length < 6) {
        const message = 'Password must be at least 6 characters';
        Platform.OS === 'web' ? alert(message) : Alert.alert('Error', message);
        return false;
      }

      if (formData.password !== formData.confirmPassword) {
        const message = 'Passwords do not match';
        Platform.OS === 'web' ? alert(message) : Alert.alert('Error', message);
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    try {
      switch (mode) {
        case 'login':
          await onLogin({
            email: formData.email,
            password: formData.password,
          });
          break;

        case 'register':
          if (onRegister) {
            await onRegister({
              name: formData.name,
              email: formData.email,
              password: formData.password,
              confirmPassword: formData.confirmPassword,
            });
          }
          break;

        case 'forgot':
          if (onForgotPassword) {
            await onForgotPassword(formData.email);
            const message = 'Password reset email sent!';
            Platform.OS === 'web'
              ? alert(message)
              : Alert.alert('Success', message);
            setMode('login');
          }
          break;
      }
    } catch (err) {
      // Error handling is done via the error prop
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    });
  };

  const switchMode = (newMode: typeof mode) => {
    setMode(newMode);
    resetForm();
  };

  const getTitle = () => {
    switch (mode) {
      case 'login':
        return 'Welcome Back!';
      case 'register':
        return 'Create Account';
      case 'forgot':
        return 'Reset Password';
    }
  };

  const getButtonText = () => {
    if (loading) {
      switch (mode) {
        case 'login':
          return 'Signing In...';
        case 'register':
          return 'Creating Account...';
        case 'forgot':
          return 'Sending Email...';
      }
    }

    switch (mode) {
      case 'login':
        return 'Sign In';
      case 'register':
        return 'Create Account';
      case 'forgot':
        return 'Send Reset Email';
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Animated.View
        style={[
          styles.formContainer,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{getTitle()}</Text>
          <Text style={styles.subtitle}>Legacy Sports</Text>
        </View>

        {/* Form Fields */}
        <View style={styles.inputContainer}>
          {mode === 'register' && (
            <TextInput
              style={styles.input}
              placeholder="Full Name"
              placeholderTextColor="#888"
              value={formData.name}
              onChangeText={(text) =>
                setFormData((prev) => ({ ...prev, name: text }))
              }
              autoCapitalize="words"
              editable={!loading}
            />
          )}

          <TextInput
            style={styles.input}
            placeholder="Email Address"
            placeholderTextColor="#888"
            value={formData.email}
            onChangeText={(text) =>
              setFormData((prev) => ({ ...prev, email: text }))
            }
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            editable={!loading}
          />

          {mode !== 'forgot' && (
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#888"
              value={formData.password}
              onChangeText={(text) =>
                setFormData((prev) => ({ ...prev, password: text }))
              }
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
              editable={!loading}
            />
          )}

          {mode === 'register' && (
            <TextInput
              style={styles.input}
              placeholder="Confirm Password"
              placeholderTextColor="#888"
              value={formData.confirmPassword}
              onChangeText={(text) =>
                setFormData((prev) => ({ ...prev, confirmPassword: text }))
              }
              secureTextEntry
              autoCapitalize="none"
              editable={!loading}
            />
          )}
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, loading && styles.disabledButton]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color={DEFAULT_COLORS.text} />
          ) : (
            <Text style={styles.submitButtonText}>{getButtonText()}</Text>
          )}
        </TouchableOpacity>

        {/* Mode Switchers */}
        <View style={styles.linksContainer}>
          {mode === 'login' && (
            <>
              <TouchableOpacity
                onPress={() => switchMode('forgot')}
                disabled={loading}
              >
                <Text style={styles.linkText}>Forgot Password?</Text>
              </TouchableOpacity>

              {onRegister && (
                <TouchableOpacity
                  style={styles.switchModeContainer}
                  onPress={() => switchMode('register')}
                  disabled={loading}
                >
                  <Text style={styles.switchModeText}>
                    Don't have an account?{' '}
                    <Text style={styles.linkText}>Sign Up</Text>
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {mode === 'register' && (
            <TouchableOpacity
              style={styles.switchModeContainer}
              onPress={() => switchMode('login')}
              disabled={loading}
            >
              <Text style={styles.switchModeText}>
                Already have an account?{' '}
                <Text style={styles.linkText}>Sign In</Text>
              </Text>
            </TouchableOpacity>
          )}

          {mode === 'forgot' && (
            <TouchableOpacity
              style={styles.switchModeContainer}
              onPress={() => switchMode('login')}
              disabled={loading}
            >
              <Text style={styles.switchModeText}>
                Remember your password?{' '}
                <Text style={styles.linkText}>Sign In</Text>
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

/**
 * Auth context provider wrapper (optional helper component)
 */
export interface AuthProviderProps {
  children: React.ReactNode;
  authState: AuthState;
  onLogin: (credentials: LoginCredentials) => Promise<void>;
  onRegister?: (data: RegisterData) => Promise<void>;
  onLogout: () => void;
  onForgotPassword?: (email: string) => Promise<void>;
}

export function AuthProvider({
  children,
  authState,
  onLogin,
  onRegister,
  onLogout,
  onForgotPassword,
}: AuthProviderProps): JSX.Element {
  if (authState.isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={DEFAULT_COLORS.accent} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!authState.isAuthenticated) {
    return (
      <AuthForm
        onLogin={onLogin}
        onRegister={onRegister}
        onForgotPassword={onForgotPassword}
        loading={authState.isLoading}
        error={authState.error}
      />
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DEFAULT_COLORS.primary,
    justifyContent: 'center',
    padding: 20,
  },
  formContainer: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 400 : undefined,
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: DEFAULT_COLORS.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: DEFAULT_COLORS.accent,
    fontWeight: '600',
  },
  inputContainer: {
    marginBottom: 24,
  },
  input: {
    backgroundColor: DEFAULT_COLORS.secondary,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: DEFAULT_COLORS.text,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: DEFAULT_COLORS.border,
    ...Platform.select({
      web: {
        outlineStyle: 'none',
      },
    }),
  },
  submitButton: {
    backgroundColor: DEFAULT_COLORS.accent,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
      },
    }),
  },
  disabledButton: {
    backgroundColor: DEFAULT_COLORS.border,
    opacity: 0.6,
  },
  submitButtonText: {
    color: DEFAULT_COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  linksContainer: {
    alignItems: 'center',
  },
  linkText: {
    color: DEFAULT_COLORS.accent,
    fontSize: 16,
    fontWeight: '600',
    textDecorationLine: Platform.OS === 'web' ? 'underline' : undefined,
  },
  switchModeContainer: {
    marginTop: 16,
  },
  switchModeText: {
    fontSize: 16,
    color: DEFAULT_COLORS.textSecondary,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: DEFAULT_COLORS.primary,
  },
  loadingText: {
    color: DEFAULT_COLORS.text,
    fontSize: 16,
    marginTop: 16,
  },
});
