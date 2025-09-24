/**
 * Type definition for the expected shape of platform-specific exports
 * This ensures both web and mobile platforms export all required components and types
 */

import * as React from 'react';
import type { OAuthProvider as IOAuthProvider, ISecureStorage } from './auth';
import type {
  FlatListProps,
  ImageProps,
  ModalProps,
  PickerItemProps,
  PickerProps,
  PressableProps,
  ScrollViewProps,
  TextInputProps,
  TextProps,
  TouchableOpacityProps,
  ViewProps,
} from './react-native-props';

// Simple type aliases for platform-specific APIs
export type AlertAPI = {
  alert: (title: string, message?: string, buttons?: unknown[]) => void;
};

export type AnimatedAPI = {
  View: React.ComponentType<
    ViewProps & {
      style?:
        | React.CSSProperties
        | React.CSSProperties[]
        | (React.CSSProperties & { transform?: { scale: AnimatedValue }[] })[];
    }
  >;
  Text: React.ComponentType<TextProps>;
  Value: new (value: number) => AnimatedValue;
  timing: (
    value: AnimatedValue,
    config: AnimatedTimingConfig,
  ) => { start: (callback?: () => void) => void };
  spring: (
    value: AnimatedValue,
    config: SpringConfig,
  ) => { start: (callback?: () => void) => void };
  parallel: (animations: { start: (callback?: () => void) => void }[]) => {
    start: (callback?: () => void) => void;
  };
};

export type DimensionsAPI = {
  get: (dimension: 'window' | 'screen') => { width: number; height: number };
  addEventListener?: (
    event: string,
    handler: (...args: unknown[]) => void,
  ) => void;
  removeEventListener?: (
    event: string,
    handler: (...args: unknown[]) => void,
  ) => void;
};

export type PlatformAPI = {
  OS: 'ios' | 'android' | 'web';
  Version: string | number;
  select: <T>(options: { ios?: T; android?: T; web?: T; default?: T }) => T;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

export type StyleSheetAPI = {
  create: <T extends { [key: string]: ReactNativeStyleProperties }>(
    styles: T,
  ) => T;
  flatten: (style: unknown) => ReactNativeStyleProperties;
  absoluteFill: ReactNativeStyleProperties;
  hairlineWidth: number;
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
    handleOAuthError: (error: unknown) => void;
    createAuthHandlers: () => Record<string, string>;
    getInteractiveButtonProps?: (disabled: boolean) => Record<string, unknown>;
  };

  // React Native Components
  ActivityIndicator: React.ComponentType<{
    size?: 'small' | 'large' | number;
    color?: string;
    animating?: boolean;
    hidesWhenStopped?: boolean;
    style?: React.CSSProperties;
  }>;
  Alert: AlertAPI;
  Animated: AnimatedAPI;
  Dimensions: DimensionsAPI;
  FlatList: <ItemT = unknown>(
    props: FlatListProps<ItemT>,
  ) => React.ReactElement | null;
  Image: React.ComponentType<ImageProps>;
  KeyboardAvoidingView: React.ComponentType<ViewProps>;
  Modal: React.ComponentType<ModalProps>;
  Picker: React.ComponentType<PickerProps> & {
    Item: React.ComponentType<PickerItemProps>;
  };
  Platform: PlatformAPI;
  Pressable: React.ComponentType<PressableProps>;
  SafeAreaView: React.ComponentType<ViewProps>;
  ScrollView: React.ComponentType<ScrollViewProps>;
  StyleSheet: StyleSheetAPI;
  Text: React.ComponentType<TextProps>;
  TextInput: React.ComponentType<
    TextInputProps & {
      autoComplete?: string;
    }
  >;
  TouchableOpacity: React.ComponentType<TouchableOpacityProps>;
  Vibration: VibrationAPI;
  View: React.ComponentType<ViewProps>;

  // Platform-specific components
  Icon: React.ComponentType<{ name: string; size?: number; color?: string }>;
  Table: React.ComponentType<{
    headers?: string[];
    data?: (string | number)[][];
    title?: string;
    columns?: unknown[];
    dataSource?: unknown[];
  }>;
  SecureStorage: ISecureStorage;
}

// Validation function to ensure platform exports conform to expected interface
export const validatePlatformExports = (
  exports: unknown,
): exports is PlatformExports => {
  if (!exports || typeof exports !== 'object') {
    return false;
  }

  const required = [
    'OAuthProvider',
    'SecureStorageProvider',
    'PlatformProviders',
    'Alert',
    'Dimensions',
    'FlatList',
    'Image',
    'Modal',
    'Platform',
    'ScrollView',
    'StyleSheet',
    'Text',
    'TextInput',
    'TouchableOpacity',
    'View',
    'Icon',
    'Table',
  ];

  return required.every((key) => key in (exports as Record<string, unknown>));
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
  interpolate?: (config: {
    inputRange: number[];
    outputRange: (number | string)[];
    extrapolate?: 'extend' | 'clamp' | 'identity';
  }) => { __getValue: () => number | string };
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
