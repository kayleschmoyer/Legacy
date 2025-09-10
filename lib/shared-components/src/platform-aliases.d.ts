declare module '__PLATFORM_COMPONENTS__' {
  import React from 'react';
  import { IconProps } from './platform-components/wrappers/LazyIcon';
  import { TableProps } from './platform-components/wrappers/LazyTable';

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
    View: React.FC<any>;
    Text: React.FC<any>;
    Value: new (value: number) => any;
    timing: (
      value: any,
      config: any,
    ) => { start: (callback?: () => void) => void };
    spring: (
      value: any,
      config: any,
    ) => { start: (callback?: () => void) => void };
  }

  export interface AlertAPI {
    alert: (title: string, message?: string, buttons?: any[]) => void;
  }

  export interface VibrationAPI {
    vibrate: (pattern?: number | number[]) => void;
    cancel: () => void;
  }

  // React Native equivalent components
  export const View: React.FC<ViewProps>;
  export const Text: React.FC<TextProps>;
  export const ScrollView: React.FC<ScrollViewProps>;
  export const TouchableOpacity: React.FC<TouchableOpacityProps>;
  export const TextInput: React.FC<TextInputProps>;
  export const ActivityIndicator: React.FC<ActivityIndicatorProps>;
  export function FlatList<ItemT>(props: FlatListProps<ItemT>): JSX.Element;
  export const Modal: React.FC<ModalProps>;
  export const SafeAreaView: React.FC<SafeAreaViewProps>;
  export const KeyboardAvoidingView: React.FC<KeyboardAvoidingViewProps>;
  export const Picker: React.FC<PickerProps> & {
    Item: React.FC<PickerItemProps>;
  };

  // Platform APIs
  export const Platform: PlatformAPI;
  export const Dimensions: DimensionsAPI;
  export const StyleSheet: StyleSheetAPI;
  export const Animated: AnimatedAPI;
  export const Alert: AlertAPI;
  export const Vibration: VibrationAPI;

  // Direct exports with common names (resolved at build time)
  export const Icon: React.FC<IconProps>;
  export const Table: React.FC<TableProps>;
  export function LoadingPanel(): JSX.Element;

  // Platform-specific named exports (for advanced usage)
  export const WebIcons: React.FC<IconProps>;
  export const WebTable: React.FC<TableProps>;
  export const MobileIcons: React.FC<IconProps>;
  export const MobileTable: React.FC<TableProps>;

  // ReactNativeEquivalents default export
  export interface ReactNativeEquivalentsModule {
    ActivityIndicator: React.FC<ActivityIndicatorProps>;
    Alert: AlertAPI;
    Animated: AnimatedAPI;
    Dimensions: DimensionsAPI;
    FlatList: <ItemT>(props: FlatListProps<ItemT>) => JSX.Element;
    KeyboardAvoidingView: React.FC<KeyboardAvoidingViewProps>;
    Modal: React.FC<ModalProps>;
    Picker: React.FC<PickerProps> & { Item: React.FC<PickerItemProps> };
    Platform: PlatformAPI;
    SafeAreaView: React.FC<SafeAreaViewProps>;
    ScrollView: React.FC<ScrollViewProps>;
    StyleSheet: StyleSheetAPI;
    Text: React.FC<TextProps>;
    TextInput: React.FC<TextInputProps>;
    TouchableOpacity: React.FC<TouchableOpacityProps>;
    Vibration: VibrationAPI;
    View: React.FC<ViewProps>;
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
