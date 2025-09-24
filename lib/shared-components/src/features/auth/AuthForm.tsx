import React, { useEffect, useState } from 'react';
import { Button, Input, Text, YStack } from 'tamagui';
import { TouchableOpacity } from '../../platform-components';
import { AuthState } from '../../types';

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

function AuthForm({
  onLogin,
  onRegister,
  onForgotPassword,
  loading = false,
  error = null,
  initialMode = 'login',
}: AuthFormProps): React.ReactElement {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>(
    initialMode,
  );
  const [formData, setFormData] = useState<RegisterData>({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [fadeAnim, setFadeAnim] = useState(0);

  useEffect(() => {
    // Simple animation using setTimeout
    setTimeout(() => {
      setFadeAnim(1);
    }, 100);
  }, []);

  useEffect(() => {
    if (error) {
      alert(error);
    }
  }, [error]);

  const validateForm = (): boolean => {
    if (!formData.email.trim()) {
      const message = 'Please enter your email';
      alert(message);
      return false;
    }

    if (!formData.email.includes('@')) {
      const message = 'Please enter a valid email address';
      alert(message);
      return false;
    }

    if (mode !== 'forgot' && !formData.password.trim()) {
      const message = 'Please enter your password';
      alert(message);
      return false;
    }

    if (mode === 'register') {
      if (!formData.name.trim()) {
        const message = 'Please enter your name';
        alert(message);
        return false;
      }

      if (formData.password.length < 6) {
        const message = 'Password must be at least 6 characters';
        alert(message);
        return false;
      }

      if (formData.password !== formData.confirmPassword) {
        const message = 'Passwords do not match';
        alert(message);
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
            alert(message);
            setMode('login');
          }
          break;
      }
    } catch {
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
    <YStack
      maxWidth={400}
      margin="auto"
      padding="$5"
      backgroundColor="white"
      borderRadius="$3"
      shadowColor="$shadowColor"
      shadowOffset={{ width: 0, height: 2 }}
      shadowOpacity={0.1}
      shadowRadius={10}
      elevation={5}
      opacity={fadeAnim}
      // Animation handled via state
    >
      <YStack>
        {/* Header */}
        <YStack alignItems="center" marginBottom="$6">
          <Text
            fontSize="$7"
            fontWeight="bold"
            color="$gray12"
            marginBottom="$1"
          >
            {getTitle()}
          </Text>
          <Text fontSize="$4" color="$gray10">
            Legacy Sports
          </Text>
        </YStack>

        {/* Form Fields */}
        <YStack gap="$4" marginBottom="$6">
          {mode === 'register' && (
            <Input
              backgroundColor="$gray1"
              borderRadius="$2"
              padding="$3"
              fontSize="$4"
              borderWidth={1}
              borderColor="$gray6"
              placeholder="Full Name"
              value={formData.name}
              onChangeText={(text: string) => {
                setFormData((prev) => ({ ...prev, name: text }));
              }}
              autoCapitalize="words"
              editable={!loading}
            />
          )}

          <Input
            backgroundColor="$gray1"
            borderRadius="$2"
            padding="$3"
            fontSize="$4"
            borderWidth={1}
            borderColor="$gray6"
            placeholder="Email Address"
            value={formData.email}
            onChangeText={(text: string) => {
              setFormData((prev) => ({ ...prev, email: text }));
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            editable={!loading}
          />

          {mode !== 'forgot' && (
            <Input
              backgroundColor="$gray1"
              borderRadius="$2"
              padding="$3"
              fontSize="$4"
              borderWidth={1}
              borderColor="$gray6"
              placeholder="Password"
              value={formData.password}
              onChangeText={(text: string) =>
                setFormData((prev) => ({ ...prev, password: text }))
              }
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
              editable={!loading}
            />
          )}

          {mode === 'register' && (
            <Input
              backgroundColor="$gray1"
              borderRadius="$2"
              padding="$3"
              fontSize="$4"
              borderWidth={1}
              borderColor="$gray6"
              placeholder="Confirm Password"
              value={formData.confirmPassword}
              onChangeText={(text: string) =>
                setFormData((prev) => ({ ...prev, confirmPassword: text }))
              }
              secureTextEntry
              autoCapitalize="none"
              editable={!loading}
            />
          )}
        </YStack>

        {/* Submit Button */}
        <Button
          backgroundColor="$blue10"
          borderRadius="$2"
          padding="$4"
          disabled={loading}
          onPress={() => void handleSubmit()}
          opacity={loading ? 0.6 : 1}
        >
          <Text fontSize="$4" fontWeight="600" color="white">
            {getButtonText()}
          </Text>
        </Button>

        {/* Navigation Links */}
        <YStack alignItems="center" marginTop="$4" gap="$3">
          {mode === 'login' && (
            <>
              <TouchableOpacity
                onPress={() => switchMode('forgot')}
                disabled={loading}
              >
                <Text color="$blue10" fontSize="$3">
                  Forgot Password?
                </Text>
              </TouchableOpacity>
              {onRegister && (
                <YStack alignItems="center">
                  <Text color="$gray10" fontSize="$3">
                    Don't have an account?{' '}
                  </Text>
                  <TouchableOpacity
                    onPress={() => switchMode('register')}
                    disabled={loading}
                  >
                    <Text color="$blue10" fontSize="$3" fontWeight="600">
                      Sign Up
                    </Text>
                  </TouchableOpacity>
                </YStack>
              )}
            </>
          )}

          {mode === 'register' && (
            <YStack alignItems="center">
              <Text color="$gray10" fontSize="$3">
                Already have an account?{' '}
              </Text>
              <TouchableOpacity
                onPress={() => switchMode('login')}
                disabled={loading}
              >
                <Text color="$blue10" fontSize="$3" fontWeight="600">
                  Sign In
                </Text>
              </TouchableOpacity>
            </YStack>
          )}

          {mode === 'forgot' && (
            <YStack alignItems="center">
              <Text color="$gray10" fontSize="$3">
                Remember your password?{' '}
              </Text>
              <TouchableOpacity
                onPress={() => switchMode('login')}
                disabled={loading}
              >
                <Text color="$blue10" fontSize="$3" fontWeight="600">
                  Sign In
                </Text>
              </TouchableOpacity>
            </YStack>
          )}
        </YStack>
      </YStack>
    </YStack>
  );
}

export { AuthForm };

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

function AuthProvider({
  children,
  authState,
  onLogin,
  onRegister,
  onLogout,
  onForgotPassword,
}: AuthProviderProps): React.ReactElement {
  if (authState.isLoading) {
    return (
      <YStack
        flex={1}
        alignItems="center"
        justifyContent="center"
        padding="$10"
      >
        <YStack
          width={40}
          height={40}
          borderWidth={4}
          borderColor="$blue10"
          borderTopColor="transparent"
          borderRadius="$round"
          marginBottom="$5"
          // Animation would be handled by CSS or animation library
        />
        <Text color="$gray12" fontSize="$4">
          Loading...
        </Text>
      </YStack>
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

  return children as React.JSX.Element;
}

export { AuthProvider };
