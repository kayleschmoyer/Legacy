declare module '__PLATFORM_COMPONENTS__' {
  import React from 'react';
  import { IconProps } from './platform-components/wrappers/LazyIcon';
  import { TableProps } from './platform-components/wrappers/LazyTable';

  // Extend CSS properties to include React Native layout properties
  declare module 'csstype' {
    interface Properties {
      marginVertical?: number | string;
      marginHorizontal?: number | string;
      paddingVertical?: number | string;
      paddingHorizontal?: number | string;
    }
  }

  // SecureStorage interface
  export interface SecureStorageOptions {
    requireAuthentication?: boolean;
  }

  export class SecureStorage {
    static setItem(
      key: string,
      value: string,
      options?: SecureStorageOptions,
    ): Promise<void>;
    static getItem(
      key: string,
      options?: SecureStorageOptions,
    ): Promise<string | null>;
    static removeItem(key: string): Promise<void>;
    static clear(): Promise<void>;
    static hasItem(key: string): Promise<boolean>;
  }

  // Basic component props interfaces
  export interface ViewProps extends React.HTMLProps<HTMLDivElement> {
    style?: React.CSSProperties | React.CSSProperties[];
    children?: React.ReactNode;
  }

  export interface TextProps extends React.HTMLProps<HTMLSpanElement> {
    style?: React.CSSProperties;
    children?: React.ReactNode;
    numberOfLines?: number;
  }

  export interface ScrollViewProps {
    style?: React.CSSProperties;
    contentContainerStyle?: React.CSSProperties;
    children?: React.ReactNode;
    className?: string;
  }

  export interface TouchableOpacityProps {
    style?: React.CSSProperties | React.CSSProperties[];
    children?: React.ReactNode;
    onPress?: () => void;
    activeOpacity?: number;
    disabled?: boolean;
    className?: string;
  }

  export interface TextInputProps {
    style?: React.CSSProperties | React.CSSProperties[];
    onChangeText?: (text: string) => void;
    multiline?: boolean;
    placeholder?: string;
    placeholderTextColor?: string;
    value?: string;
    defaultValue?: string;
    disabled?: boolean;
    className?: string;
    onFocus?: () => void;
    onBlur?: () => void;
    autoFocus?: boolean;
    autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
    keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
    secureTextEntry?: boolean;
    editable?: boolean;
    autoComplete?: string;
    autoCorrect?: boolean;
  }

  export interface ActivityIndicatorProps {
    size?: 'small' | 'large';
    color?: string;
    style?: React.CSSProperties;
  }

  export interface FlatListProps<ItemT> {
    data: ItemT[];
    renderItem: ({
      item,
      index,
    }: {
      item: ItemT;
      index: number;
    }) => React.ReactElement;
    keyExtractor?: (item: ItemT, index: number) => string;
    style?: React.CSSProperties | React.CSSProperties[];
    numColumns?: number;
    horizontal?: boolean;
    contentContainerStyle?: React.CSSProperties;
    onEndReached?: () => void;
    onEndReachedThreshold?: number;
    ListHeaderComponent?: React.ComponentType<any> | React.ReactElement | null;
    ListFooterComponent?: React.ComponentType<any> | React.ReactElement | null;
    ListEmptyComponent?: React.ComponentType<any> | React.ReactElement | null;
    showsHorizontalScrollIndicator?: boolean;
    showsVerticalScrollIndicator?: boolean;
  }

  export interface ModalProps {
    visible: boolean;
    transparent?: boolean;
    animationType?: 'none' | 'slide' | 'fade';
    onRequestClose?: () => void;
    style?: React.CSSProperties;
    children?: React.ReactNode;
  }

  export interface SafeAreaViewProps extends React.HTMLProps<HTMLDivElement> {
    style?: React.CSSProperties;
    children?: React.ReactNode;
  }

  export interface KeyboardAvoidingViewProps {
    style?: React.CSSProperties;
    children?: React.ReactNode;
    behavior?: 'height' | 'position' | 'padding';
    keyboardVerticalOffset?: number;
    enabled?: boolean;
  }

  export interface PickerProps {
    selectedValue?: string | number;
    onValueChange?: (value: string | number, index: number) => void;
    style?: React.CSSProperties;
    children?: React.ReactNode;
  }

  export interface PickerItemProps {
    label: string;
    value: string | number;
    color?: string;
    testID?: string;
  }

  // Platform API interfaces
  export interface PlatformAPI {
    OS: 'web' | 'ios' | 'android';
    select: <T>(specifics: { web?: T; ios?: T; android?: T; default?: T }) => T;
  }

  export interface DimensionsAPI {
    get: (dimension: 'window' | 'screen') => { width: number; height: number };
    addEventListener: (event: string, handler: Function) => void;
    removeEventListener: (event: string, handler: Function) => void;
  }

  export interface StyleSheetAPI {
    create: <T extends Record<string, React.CSSProperties>>(styles: T) => T;
  }

  export interface AnimatedAPI {
    View: (props: any) => React.ReactNode;
    Text: (props: any) => React.ReactNode;
    Value: new (value: number) => any;
    timing: (
      value: any,
      config: any,
    ) => { start: (callback?: () => void) => void };
    spring: (
      value: any,
      config: any,
    ) => { start: (callback?: () => void) => void };
    parallel: (animations: any[]) => { start: (callback?: () => void) => void };
  }

  export interface AlertAPI {
    alert: (title: string, message?: string, buttons?: any[]) => void;
  }

  export interface VibrationAPI {
    vibrate: (pattern?: number | number[]) => void;
    cancel: () => void;
  }

  // React Native equivalent components
  export const View: (props: ViewProps) => React.ReactNode;
  export const Text: (props: TextProps) => React.ReactNode;
  export const ScrollView: (props: ScrollViewProps) => React.ReactNode;
  export const TouchableOpacity: (
    props: TouchableOpacityProps,
  ) => React.ReactNode;
  export const TextInput: (props: TextInputProps) => React.ReactNode;
  export const ActivityIndicator: (
    props: ActivityIndicatorProps,
  ) => React.ReactNode;
  export const FlatList: <ItemT>(
    props: FlatListProps<ItemT>,
  ) => React.ReactNode;
  export const Modal: (props: ModalProps) => React.ReactNode;
  export const SafeAreaView: (props: SafeAreaViewProps) => React.ReactNode;
  export const KeyboardAvoidingView: (
    props: KeyboardAvoidingViewProps,
  ) => React.ReactNode;
  export const Picker: ((props: PickerProps) => React.ReactNode) & {
    Item: (props: PickerItemProps) => React.ReactNode;
  };

  // Platform APIs
  export const Platform: PlatformAPI;
  export const Dimensions: DimensionsAPI;
  export const StyleSheet: StyleSheetAPI;
  export const Animated: AnimatedAPI;
  export const Alert: AlertAPI;
  export const Vibration: VibrationAPI;

  // Direct exports with common names (resolved at build time)
  export const Icon: (props: IconProps) => React.ReactNode;
  export const Table: (props: TableProps) => React.ReactNode;
  export const LoadingPanel: () => React.ReactNode;

  // Platform-specific named exports (for advanced usage)
  export const WebIcons: (props: IconProps) => React.ReactNode;
  export const WebTable: (props: TableProps) => React.ReactNode;
  export const MobileIcons: (props: IconProps) => React.ReactNode;
  export const MobileTable: (props: TableProps) => React.ReactNode;

  // ReactNativeEquivalents default export
  export interface ReactNativeEquivalentsModule {
    ActivityIndicator: (props: ActivityIndicatorProps) => React.ReactNode;
    Alert: AlertAPI;
    Animated: AnimatedAPI;
    Dimensions: DimensionsAPI;
    FlatList: <ItemT>(props: FlatListProps<ItemT>) => React.ReactNode;
    KeyboardAvoidingView: (props: KeyboardAvoidingViewProps) => React.ReactNode;
    Modal: (props: ModalProps) => React.ReactNode;
    Picker: ((props: PickerProps) => React.ReactNode) & {
      Item: (props: PickerItemProps) => React.ReactNode;
    };
    Platform: PlatformAPI;
    SafeAreaView: (props: SafeAreaViewProps) => React.ReactNode;
    ScrollView: (props: ScrollViewProps) => React.ReactNode;
    StyleSheet: StyleSheetAPI;
    Text: (props: TextProps) => React.ReactNode;
    TextInput: (props: TextInputProps) => React.ReactNode;
    TouchableOpacity: (props: TouchableOpacityProps) => React.ReactNode;
    Vibration: VibrationAPI;
    View: (props: ViewProps) => React.ReactNode;
  }

  export const ReactNativeEquivalents: ReactNativeEquivalentsModule;
}

// Global declarations for web platform compatibility
declare global {
  interface Window {
    StyleSheet: {
      create: <T extends Record<string, React.CSSProperties>>(styles: T) => T;
    };
  }

  var StyleSheet: {
    create: <T extends Record<string, React.CSSProperties>>(styles: T) => T;
  };
}
