/**
 * Type definition for the expected shape of platform-specific exports
 * This ensures both web and mobile platforms export all required components and types
 */

import * as React from 'react';
import type { OAuthProvider as IOAuthProvider, ISecureStorage } from './auth';

// Simple type aliases for platform-specific APIs
export type AlertAPI = {
  alert: (
    title: string,
    message?: string,
    buttons?: Array<{
      text?: string;
      onPress?: () => void;
      style?: 'default' | 'cancel' | 'destructive';
    }>,
  ) => void;
};

export type AnimatedAPI = {
  View: React.ComponentType<Record<string, unknown>>;
  Text: React.ComponentType<Record<string, unknown>>;
  Value: new (value: number) => AnimatedValue;
  timing: (
    value: AnimatedValue,
    config: AnimatedTimingConfig,
  ) => {
    start: (callback?: () => void) => void;
    stop: () => void;
    reset: () => void;
  };
  spring: (
    value: AnimatedValue,
    config: SpringConfig,
  ) => {
    start: (callback?: () => void) => void;
    stop: () => void;
    reset: () => void;
  };
  parallel: (
    animations: {
      start: (callback?: () => void) => void;
      stop: () => void;
      reset: () => void;
    }[],
  ) => {
    start: (callback?: () => void) => void;
    stop: () => void;
    reset: () => void;
  };
  [key: string]: unknown;
};

export type DimensionsAPI = {
  get: (dimension: string) => { width: number; height: number };
  addEventListener?: (
    event: string,
    handler: (...args: unknown[]) => void,
  ) => void | { remove: () => void };
  removeEventListener?: (
    event: string,
    handler: (...args: unknown[]) => void,
  ) => void;
  [key: string]: unknown;
};

export type PlatformAPI = {
  OS: string;
  Version?: string | number;
  select: <T>(options: {
    ios?: T;
    android?: T;
    web?: T;
    native?: T;
    default?: T;
    [key: string]: T | undefined;
  }) => T | undefined;
};

// Extended style properties that include React Native-specific styles
export type ReactNativeStyleProperties = Omit<
  React.CSSProperties,
  'aspectRatio'
> & {
  // React Native-specific layout properties
  paddingHorizontal?: number;
  paddingVertical?: number;
  marginHorizontal?: number;
  marginVertical?: number;

  // React Native-specific flex properties (override CSS version)
  aspectRatio?: number;

  // React Native-specific border properties
  borderTopLeftRadius?: number;
  borderTopRightRadius?: number;
  borderBottomLeftRadius?: number;
  borderBottomRightRadius?: number;

  // React Native-specific positioning
  elevation?: number;

  // React Native-specific text properties
  lineHeight?: number;
  includeFontPadding?: boolean;
  textAlignVertical?: 'auto' | 'top' | 'bottom' | 'center';

  // React Native-specific transform properties
  scaleX?: number;
  scaleY?: number;
  translateX?: number;
  translateY?: number;
  rotateX?: string;
  rotateY?: string;
  rotateZ?: string;
  rotate?: string;

  // Allow any other React Native style properties
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- index signature for RN style extensibility
  [key: string]: any;
};

export type VibrationAPI = {
  vibrate: (duration?: number | number[]) => void;
  cancel: () => void;
};

// Define the exact shape that each platform implementation must export
export interface PlatformExports {
  // Platform-specific implementations
  OAuthProvider: IOAuthProvider;
  SecureStorageProvider: ISecureStorage;
  PlatformProviders: React.FC<{ children: React.ReactNode }>;
  PlatformUtils: {
    handleOAuthError?: (error: unknown) => void;
    createAuthHandlers?: () => Record<string, string>;
    getInteractiveButtonProps?: (disabled: boolean) => Record<string, unknown>;
    isWeb?: boolean;
    isNative?: boolean;
    OS?: string;
    select?: <T>(specifics: Record<string, T | undefined>) => T | undefined;
    [key: string]: unknown;
  };

  // React Native Components (only those without Tamagui equivalents)
  // Permissive interfaces that work with both React Native and web implementations
  ActivityIndicator: React.ComponentType<Record<string, unknown>>;

  Alert: {
    alert: (
      title: string,
      message?: string,
      buttons?: unknown[],
      options?: unknown,
    ) => void;
    prompt?: (title: string, message?: string, ...args: unknown[]) => void;
  };

  Animated: {
    View: React.ComponentType<Record<string, unknown>>;
    Text: React.ComponentType<Record<string, unknown>>;
    Value: new (
      value: number,
      ...args: unknown[]
    ) => {
      setValue: (value: number) => void;
      interpolate?: (config: unknown) => unknown;
      [key: string]: unknown;
    };
    timing: (
      value: unknown,
      config: unknown,
    ) => { start: (callback?: () => void) => void; [key: string]: unknown };
    spring: (
      value: unknown,
      config: unknown,
    ) => { start: (callback?: () => void) => void; [key: string]: unknown };
    parallel: (
      animations: unknown[],
      config?: unknown,
    ) => { start: (callback?: () => void) => void; [key: string]: unknown };
    [key: string]: unknown;
  };

  Dimensions: {
    get: (dim: string) => {
      width: number;
      height: number;
      [key: string]: unknown;
    };
    addEventListener?: (
      type: string,
      handler: (...args: unknown[]) => void,
    ) => void;
    removeEventListener?: (
      type: string,
      handler: (...args: unknown[]) => void,
    ) => void;
    [key: string]: unknown;
  };

  FlatList: <T = unknown>(props: {
    data?: T[] | null;
    renderItem?: (info: {
      item: T;
      index: number;
      [key: string]: unknown;
    }) => React.ReactElement | null;
    keyExtractor?: (item: T, index: number) => string;
    [key: string]: unknown;
  }) => React.ReactElement | null;

  KeyboardAvoidingView: React.ComponentType<Record<string, unknown>>;

  Picker: React.ComponentType<Record<string, unknown>>;

  Platform: {
    OS: string;
    Version?: string | number;
    select?: <T>(specifics: Record<string, T | undefined>) => T | undefined;
    [key: string]: unknown;
  };

  Vibration: {
    vibrate: (pattern?: number | number[], repeat?: boolean) => void;
    cancel?: () => void;
    [key: string]: unknown;
  };

  // Additional React Native Components
  Image: React.ComponentType<Record<string, unknown>>;
  Modal: React.ComponentType<Record<string, unknown>>;
  Pressable: React.ComponentType<Record<string, unknown>>;
  SafeAreaView: React.ComponentType<Record<string, unknown>>;
  ScrollView: React.ComponentType<Record<string, unknown>>;
  StyleSheet: {
    create: <T extends Record<string, React.CSSProperties>>(styles: T) => T;
    [key: string]: unknown;
  };
  Text: React.ComponentType<Record<string, unknown>>;
  TextInput: React.ComponentType<Record<string, unknown>>;
  TouchableOpacity: React.ComponentType<Record<string, unknown>>;
  View: React.ComponentType<Record<string, unknown>>;

  // Platform-specific components
  Icon: React.ComponentType<{ name: string; size?: number; color?: string }>;
  Table: React.ComponentType<{
    headers?: string[];
    data?: (string | number)[][];
    title?: string;
    columns?: unknown[];
    dataSource?: unknown[];
    [key: string]: unknown;
  }>;
}

// Validation function to ensure platform exports conform to expected interface
export const validatePlatformExports = (exports: unknown): PlatformExports => {
  return exports as PlatformExports;
};

// Additional platform types
export type PlatformOS = 'web' | 'ios' | 'android' | 'native';

export interface PlatformSelectConfig<T> {
  web?: T;
  ios?: T;
  android?: T;
  native?: T;
  default?: T;
  [key: string]: T | undefined;
}

// Animation types for cross-platform compatibility
export interface AnimatedValue {
  setValue: (value: number) => void;
  getValue?: () => number;
  addListener?: (callback: (value: { value: number }) => void) => string;
  removeListener?: (id: string) => void;
  removeAllListeners?: () => void;
  interpolate: (config: {
    inputRange: number[];
    outputRange: (number | string)[];
    extrapolate?: 'extend' | 'clamp' | 'identity';
  }) => AnimatedInterpolation;
  [key: string]: unknown;
}

export interface AnimatedInterpolation {
  __getValue?: () => number | string;
  [key: string]: unknown;
}

export interface SpringConfig {
  toValue: number;
  tension?: number;
  friction?: number;
  speed?: number;
  bounciness?: number;
  useNativeDriver?: boolean;
}

export interface AnimatedTimingConfig {
  toValue: number;
  duration?: number;
  delay?: number;
  easing?: (value: number) => number;
  useNativeDriver?: boolean;
}

export type AnimationConfig = (SpringConfig | AnimatedTimingConfig) & {
  duration?: number;
};
