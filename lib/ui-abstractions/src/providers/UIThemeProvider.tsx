import * as React from 'react';
import { createContext, useContext, useCallback, useMemo } from 'react';
import { TamaguiProvider, Theme, useTheme as useTamaguiTheme } from 'tamagui';
import type { UITheme, UIThemeContextValue } from '../types/ui';

// Default theme configuration
const defaultLightTheme: UITheme = {
  colors: {
    primary: '#007AFF',
    secondary: '#5856D6',
    background: '#FFFFFF',
    surface: '#F2F2F7',
    text: '#000000',
    textSecondary: '#6D6D70',
    border: '#C7C7CC',
    success: '#34C759',
    warning: '#FF9500',
    error: '#FF3B30',
    disabled: '#C7C7CC',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  typography: {
    sizes: {
      xs: 12,
      sm: 14,
      md: 16,
      lg: 18,
      xl: 20,
      xxl: 24,
    },
    weights: {
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
    },
  },
  radii: {
    sm: 4,
    md: 8,
    lg: 12,
    full: 9999,
  },
};

const defaultDarkTheme: UITheme = {
  ...defaultLightTheme,
  colors: {
    primary: '#0A84FF',
    secondary: '#5E5CE6',
    background: '#000000',
    surface: '#1C1C1E',
    text: '#FFFFFF',
    textSecondary: '#8E8E93',
    border: '#38383A',
    success: '#30D158',
    warning: '#FF9F0A',
    error: '#FF453A',
    disabled: '#48484A',
  },
};

// Theme context
const UIThemeContext = createContext<UIThemeContextValue | null>(null);

// Theme provider props
interface UIThemeProviderProps {
  children: React.ReactNode;
  theme?: 'light' | 'dark' | 'auto';
  customLightTheme?: Partial<UITheme>;
  customDarkTheme?: Partial<UITheme>;
  tamaguiConfig: any; // Tamagui config object
}

// Theme provider component that wraps Tamagui
export function UIThemeProvider({
  children,
  theme = 'auto',
  customLightTheme,
  customDarkTheme,
  tamaguiConfig,
}: UIThemeProviderProps) {
  const [currentTheme, setCurrentTheme] = React.useState<'light' | 'dark'>(() => {
    if (theme === 'auto') {
      // In browser environment, check for dark mode preference
      if (typeof window !== 'undefined') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      return 'light';
    }
    return theme;
  });

  // Listen for system theme changes when in auto mode
  React.useEffect(() => {
    if (theme === 'auto' && typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => {
        setCurrentTheme(e.matches ? 'dark' : 'light');
      };
      
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
    // No cleanup needed for non-auto themes
    return undefined;
  }, [theme]);

  // Merge custom themes with defaults
  const lightTheme = useMemo(() => ({
    ...defaultLightTheme,
    ...customLightTheme && {
      colors: { ...defaultLightTheme.colors, ...customLightTheme.colors },
      spacing: { ...defaultLightTheme.spacing, ...customLightTheme.spacing },
      typography: { ...defaultLightTheme.typography, ...customLightTheme.typography },
      radii: { ...defaultLightTheme.radii, ...customLightTheme.radii },
    },
  }), [customLightTheme]);

  const darkTheme = useMemo(() => ({
    ...defaultDarkTheme,
    ...customDarkTheme && {
      colors: { ...defaultDarkTheme.colors, ...customDarkTheme.colors },
      spacing: { ...defaultDarkTheme.spacing, ...customDarkTheme.spacing },
      typography: { ...defaultDarkTheme.typography, ...customDarkTheme.typography },
      radii: { ...defaultDarkTheme.radii, ...customDarkTheme.radii },
    },
  }), [customDarkTheme]);

  const activeTheme = currentTheme === 'dark' ? darkTheme : lightTheme;

  const toggleTheme = useCallback(() => {
    setCurrentTheme(prev => prev === 'light' ? 'dark' : 'light');
  }, []);

  const setThemeMode = useCallback((themeMode: 'light' | 'dark') => {
    setCurrentTheme(themeMode);
  }, []);

  const contextValue = useMemo((): UIThemeContextValue => ({
    theme: activeTheme,
    isDark: currentTheme === 'dark',
    toggleTheme,
    setTheme: setThemeMode,
  }), [activeTheme, currentTheme, toggleTheme, setThemeMode]);

  return (
    <TamaguiProvider config={tamaguiConfig}>
      <Theme name={currentTheme}>
        <UIThemeContext.Provider value={contextValue}>
          {children}
        </UIThemeContext.Provider>
      </Theme>
    </TamaguiProvider>
  );
}

// Hook to access theme
export function useUITheme(): UIThemeContextValue {
  const context = useContext(UIThemeContext);
  if (!context) {
    throw new Error('useUITheme must be used within a UIThemeProvider');
  }
  return context;
}

// Hook to access Tamagui theme tokens
export function useTamaguiTokens(): any {
  return useTamaguiTheme();
}

// Utility to create theme-aware styles
export function createStyles<T extends Record<string, any>>(
  styleCreator: (theme: UITheme) => T
): () => T {
  return (): T => {
    const { theme } = useUITheme();
    return styleCreator(theme);
  };
}

// Helper component for theme-aware styling
interface ThemedProps {
  children: (theme: UITheme) => React.ReactNode;
}

export function Themed({ children }: ThemedProps) {
  const { theme } = useUITheme();
  return <>{children(theme)}</>;
}
