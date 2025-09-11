import React, { useEffect, useState } from 'react';
import { DEFAULT_COLORS } from '../../config/sports';
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

export function AuthForm({
  onLogin,
  onRegister,
  onForgotPassword,
  loading = false,
  error = null,
  initialMode = 'login',
}: AuthFormProps): React.JSX.Element {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>(
    initialMode
  );
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [fadeAnim, setFadeAnim] = useState(0);
  const [slideAnim, setSlideAnim] = useState(50);

  useEffect(() => {
    // Simple animation using setTimeout
    setTimeout(() => {
      setFadeAnim(1);
      setSlideAnim(0);
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
    <div
      style={{
        maxWidth: '400px',
        margin: '0 auto',
        padding: '20px',
        backgroundColor: '#fff',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        opacity: fadeAnim,
        transform: `translateY(${slideAnim}px)`,
        transition: 'opacity 0.6s ease, transform 0.6s ease',
      }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '30px' }}>
        <h2 style={{ margin: '0 0 10px 0', color: '#333' }}>{getTitle()}</h2>
        <p style={{ margin: '0', color: '#666' }}>Legacy Sports</p>
      </div>

      {/* Form Fields */}
      <div style={{ marginBottom: '20px' }}>
        {mode === 'register' && (
          <input
            style={{
              width: '100%',
              padding: '12px',
              marginBottom: '15px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '16px',
              boxSizing: 'border-box',
            }}
            placeholder="Full Name"
            value={formData.name}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            disabled={loading}
          />
        )}

        <input
          style={{
            width: '100%',
            padding: '12px',
            marginBottom: '15px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '16px',
            boxSizing: 'border-box',
          }}
          placeholder="Email Address"
          type="email"
          value={formData.email}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, email: e.target.value }))
          }
          disabled={loading}
        />

        {mode !== 'forgot' && (
          <input
            style={{
              width: '100%',
              padding: '12px',
              marginBottom: '15px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '16px',
              boxSizing: 'border-box',
            }}
            placeholder="Password"
            type="password"
            value={formData.password}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, password: e.target.value }))
            }
            disabled={loading}
          />
        )}

        {mode === 'register' && (
          <input
            style={{
              width: '100%',
              padding: '12px',
              marginBottom: '15px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '16px',
              boxSizing: 'border-box',
            }}
            placeholder="Confirm Password"
            type="password"
            value={formData.confirmPassword}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, confirmPassword: e.target.value }))
            }
            disabled={loading}
          />
        )}
      </div>

      {/* Submit Button */}
      <button
        style={{
          width: '100%',
          padding: '12px',
          backgroundColor: loading ? '#ccc' : '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          fontSize: '16px',
          cursor: loading ? 'not-allowed' : 'pointer',
          marginBottom: '20px',
        }}
        onClick={() => { void handleSubmit(); }}
        disabled={loading}
      >
        {loading ? 'Loading...' : getButtonText()}
      </button>

      {/* Mode Switchers */}
      <div style={{ textAlign: 'center' }}>
        {mode === 'login' && (
          <>
            <button
              style={{
                background: 'none',
                border: 'none',
                color: '#007bff',
                cursor: 'pointer',
                marginBottom: '10px',
              }}
              onClick={() => switchMode('forgot')}
              disabled={loading}
            >
              Forgot Password?
            </button>

            {onRegister && (
              <div style={{ marginTop: '10px' }}>
                <span>Don't have an account? </span>
                <button
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#007bff',
                    cursor: 'pointer',
                  }}
                  onClick={() => switchMode('register')}
                  disabled={loading}
                >
                  Sign Up
                </button>
              </div>
            )}
          </>
        )}

        {mode === 'register' && (
          <div style={{ marginTop: '10px' }}>
            <span>Already have an account? </span>
            <button
              style={{
                background: 'none',
                border: 'none',
                color: '#007bff',
                cursor: 'pointer',
              }}
              onClick={() => switchMode('login')}
              disabled={loading}
            >
              Sign In
            </button>
          </div>
        )}

        {mode === 'forgot' && (
          <div style={{ marginTop: '10px' }}>
            <span>Remember your password? </span>
            <button
              style={{
                background: 'none',
                border: 'none',
                color: '#007bff',
                cursor: 'pointer',
              }}
              onClick={() => switchMode('login')}
              disabled={loading}
            >
              Sign In
            </button>
          </div>
        )}
      </div>
    </div>
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
}: AuthProviderProps): React.JSX.Element {
  if (authState.isLoading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px',
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: `4px solid ${DEFAULT_COLORS.accent}`,
          borderTopColor: 'transparent',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: '20px',
        }} />
        <p style={{ color: DEFAULT_COLORS.text, fontSize: '16px' }}>Loading...</p>
      </div>
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

// Add CSS animation for spinner
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}
