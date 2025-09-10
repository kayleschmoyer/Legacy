import React from 'react';

// Web equivalents for React Native components
export const View: React.FC<React.HTMLProps<HTMLDivElement>> = ({
  style,
  children,
  ...props
}) => (
  <div style={style as React.CSSProperties} {...props}>
    {children}
  </div>
);

export const Text: React.FC<React.HTMLProps<HTMLSpanElement>> = ({
  style,
  children,
  ...props
}) => (
  <span style={style as React.CSSProperties} {...props}>
    {children}
  </span>
);

interface ScrollViewProps {
  style?: React.CSSProperties;
  contentContainerStyle?: React.CSSProperties;
  children?: React.ReactNode;
  className?: string;
}

export const ScrollView: React.FC<ScrollViewProps> = ({
  style,
  children,
  contentContainerStyle,
  className,
}) => (
  <div
    className={className}
    style={{
      overflow: 'auto',
      ...(style as React.CSSProperties),
      ...(contentContainerStyle as React.CSSProperties),
    }}
  >
    {children}
  </div>
);

interface TouchableOpacityProps {
  style?: React.CSSProperties;
  children?: React.ReactNode;
  onPress?: () => void;
  activeOpacity?: number;
  disabled?: boolean;
  className?: string;
}

export const TouchableOpacity: React.FC<TouchableOpacityProps> = ({ 
  style, 
  children, 
  onPress, 
  activeOpacity = 0.7, 
  disabled,
  className,
}) => (
  <button
    type="button"
    disabled={disabled}
    className={className}
    style={{
      background: 'none',
      border: 'none',
      cursor: disabled ? 'default' : 'pointer',
      ...(style as React.CSSProperties),
    }}
    onClick={disabled ? undefined : onPress}
    onMouseDown={disabled ? undefined : (e) => {
      (e.target as HTMLElement).style.opacity = activeOpacity.toString();
    }}
    onMouseUp={disabled ? undefined : (e) => {
      (e.target as HTMLElement).style.opacity = '1';
    }}
    onMouseLeave={disabled ? undefined : (e) => {
      (e.target as HTMLElement).style.opacity = '1';
    }}
  >
    {children}
  </button>
);

export const ActivityIndicator: React.FC<{
  size?: 'small' | 'large';
  color?: string;
  style?: React.CSSProperties;
}> = ({ size = 'small', color = '#007AFF', style }) => (
  <div
    style={{
      display: 'inline-block',
      width: size === 'large' ? '36px' : '20px',
      height: size === 'large' ? '36px' : '20px',
      border: `3px solid ${color}`,
      borderTopColor: 'transparent',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite',
      ...style,
    }}
  />
);

interface TextInputProps {
  style?: React.CSSProperties;
  onChangeText?: (text: string) => void;
  multiline?: boolean;
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  disabled?: boolean;
  className?: string;
}

export const TextInput: React.FC<TextInputProps> = ({ 
  style, 
  onChangeText, 
  multiline, 
  placeholder,
  value,
  defaultValue,
  disabled,
  className,
}) => {
  const Component = multiline ? 'textarea' : 'input';

  return React.createElement(Component, {
    className,
    placeholder,
    value,
    defaultValue,
    disabled,
    style: {
      padding: '8px',
      border: '1px solid #ccc',
      borderRadius: '4px',
      ...(style as React.CSSProperties),
    },
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      onChangeText?.(e.target.value);
    },
  });
};

export const StyleSheet = {
  create: <T extends Record<string, React.CSSProperties>>(styles: T): T =>
    styles,
};

export const Platform = {
  OS: 'web' as const,
  select: (specifics: { web?: any; default?: any; [key: string]: any }) =>
    specifics.web ?? specifics.default,
};

export const Dimensions = {
  get: (dimension: 'window' | 'screen') => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 375,
    height: typeof window !== 'undefined' ? window.innerHeight : 667,
  }),
  addEventListener: (event: string, handler: Function) => {
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handler as EventListener);
    }
  },
  removeEventListener: (event: string, handler: Function) => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', handler as EventListener);
    }
  },
};

// Add CSS animation for ActivityIndicator
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

// Default export for the entire module
const ReactNativeEquivalents = {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  StyleSheet,
  Platform,
  Dimensions,
};

export default ReactNativeEquivalents;
