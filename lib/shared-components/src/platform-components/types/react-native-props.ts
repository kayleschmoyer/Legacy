/**
 * React Native component prop interfaces
 *
 * These interfaces define the expected props for React Native components
 * that need platform-specific implementations for web compatibility.
 */

import * as React from 'react';
import type { ReactNativeStyleProperties } from './platform-exports';

// Style type that allows conditional false values for React Native pattern
export type StyleProp =
  | ReactNativeStyleProperties
  | ReactNativeStyleProperties[]
  | (ReactNativeStyleProperties | false | null | undefined)[];

export interface TouchableOpacityProps {
  style?: StyleProp;
  children?: React.ReactNode;
  onPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  activeOpacity?: number;
  disabled?: boolean;
  accessible?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

// Base interface for VirtualizedList props (simplified version of what FlatList extends)
export interface VirtualizedListProps<ItemT> {
  data: ArrayLike<ItemT> | null | undefined;
  renderItem:
    | ((info: { item: ItemT; index: number }) => React.ReactElement | null)
    | null
    | undefined;
  keyExtractor?: (item: ItemT, index: number) => string;
  getItemLayout?: (
    data: ArrayLike<ItemT> | null | undefined,
    index: number,
  ) => { length: number; offset: number; index: number };
  initialNumToRender?: number;
  onEndReached?: (info: { distanceFromEnd: number }) => void;
  onEndReachedThreshold?: number;
  extraData?: unknown;
  ItemSeparatorComponent?:
    | React.ComponentType<Record<string, unknown>>
    | React.ReactElement
    | null;
  ListHeaderComponent?:
    | React.ComponentType<Record<string, unknown>>
    | React.ReactElement
    | null;
  ListFooterComponent?:
    | React.ComponentType<Record<string, unknown>>
    | React.ReactElement
    | null;
  ListEmptyComponent?:
    | React.ComponentType<Record<string, unknown>>
    | React.ReactElement
    | null;
  refreshing?: boolean | null;
  onRefresh?: (() => void) | null;
  removeClippedSubviews?: boolean;
  scrollEnabled?: boolean;
  showsHorizontalScrollIndicator?: boolean;
  showsVerticalScrollIndicator?: boolean;
  style?: StyleProp;
  contentContainerStyle?: StyleProp;
  horizontal?: boolean | null;
  keyboardShouldPersistTaps?: boolean | 'always' | 'never' | 'handled';
}

// FlatList interface matching React Native's FlatListProps<ItemT>
export interface FlatListProps<ItemT = unknown>
  extends VirtualizedListProps<ItemT> {
  /**
   * Optional custom style for multi-item rows generated when numColumns > 1
   */
  columnWrapperstyle?: StyleProp;

  /**
   * Multiple columns can only be rendered with `horizontal={false}` and will zig-zag like a `flexWrap` layout.
   * Items should all be the same height - masonry layouts are not supported.
   */
  numColumns?: number;

  /**
   * Uses legacy MetroListView instead of default VirtualizedSectionList
   */
  legacyImplementation?: boolean;

  /**
   * Instead of starting at the top with the first item, start at initialScrollIndex
   */
  initialScrollIndex?: number | null;

  /**
   * Called when the viewability of rows changes, as defined by the `viewablePercentThreshold` prop.
   */
  onViewableItemsChanged?:
    | ((info: {
        viewableItems: Array<{
          item: ItemT;
          key: string;
          index: number | null;
          isViewable: boolean;
          section?: unknown;
        }>;
        changed: Array<{
          item: ItemT;
          key: string;
          index: number | null;
          isViewable: boolean;
          section?: unknown;
        }>;
      }) => void)
    | null;

  /**
   * Fades out the edges of the scroll content.
   * @platform android
   */
  fadingEdgeLength?: number;
}

export interface ScrollViewProps {
  style?: StyleProp;
  contentContainerStyle?: StyleProp;
  children?: React.ReactNode;
  horizontal?: boolean;
  showsHorizontalScrollIndicator?: boolean;
  showsVerticalScrollIndicator?: boolean;
  scrollEnabled?: boolean;
  bounces?: boolean;
  onScroll?: (event: {
    nativeEvent: { contentOffset: { x: number; y: number } };
  }) => void;
  scrollEventThrottle?: number;
}

export interface ModalProps {
  visible?: boolean;
  animationType?: 'none' | 'slide' | 'fade';
  transparent?: boolean;
  onShow?: () => void;
  onDismiss?: () => void;
  onRequestClose?: () => void;
  statusBarTranslucent?: boolean;
  children?: React.ReactNode;
}

export interface TextProps {
  style?:
    | StyleProp
    | ReactNativeStyleProperties[]
    | (ReactNativeStyleProperties | false | null | undefined)[];
  children?: React.ReactNode;
  numberOfLines?: number;
  ellipsizeMode?: 'head' | 'middle' | 'tail' | 'clip';
  accessible?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

export interface ViewProps {
  style?:
    | ReactNativeStyleProperties
    | ReactNativeStyleProperties[]
    | (ReactNativeStyleProperties | false | null | undefined)[];
  children?: React.ReactNode;
  accessible?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  onLayout?: (event: {
    nativeEvent: {
      layout: { x: number; y: number; width: number; height: number };
    };
  }) => void;
}

export interface TextInputProps {
  style?: StyleProp;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  placeholderTextColor?: string;
  onChangeText?: (text: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onSubmitEditing?: () => void;
  multiline?: boolean;
  numberOfLines?: number;
  maxLength?: number;
  editable?: boolean;
  secureTextEntry?: boolean;
  keyboardType?:
    | 'default'
    | 'numeric'
    | 'email-address'
    | 'phone-pad'
    | 'visible-password';
  returnKeyType?: 'done' | 'go' | 'next' | 'search' | 'send';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  autoFocus?: boolean;
  blurOnSubmit?: boolean;
  clearButtonMode?: 'never' | 'while-editing' | 'unless-editing' | 'always';
  selectTextOnFocus?: boolean;
  selection?: { start: number; end?: number };
  testID?: string;
}

export interface ImageProps {
  source: { uri: string } | number;
  style?: StyleProp;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'repeat' | 'center';
  onLoad?: () => void;
  onError?: (error: { nativeEvent: { error: string } }) => void;
  onLoadStart?: () => void;
  onLoadEnd?: () => void;
  onProgress?: (event: {
    nativeEvent: { loaded: number; total: number };
  }) => void;
  accessible?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

export interface PickerProps {
  selectedValue?: string | number | boolean;
  onValueChange?: (
    itemValue: string | number | boolean,
    itemIndex: number,
  ) => void;
  style?: StyleProp;
  enabled?: boolean;
  mode?: 'dialog' | 'dropdown';
  prompt?: string;
  itemstyle?: StyleProp;
  dropdownIconColor?: string;
  children?: React.ReactNode;
}

export interface PickerItemProps {
  label?: string;
  value?: string | number | boolean;
  color?: string;
  testID?: string;
}

export interface PressableProps {
  style?:
    | ReactNativeStyleProperties
    | ReactNativeStyleProperties[]
    | ((state: { pressed: boolean }) => ReactNativeStyleProperties);
  children?:
    | React.ReactNode
    | ((state: { pressed: boolean }) => React.ReactNode);
  onPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  hitSlop?:
    | number
    | { top?: number; left?: number; bottom?: number; right?: number };
  testID?: string;
  accessible?: boolean;
  accessibilityLabel?: string;
}
