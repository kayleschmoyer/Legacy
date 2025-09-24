import React from 'react';
import type {
  AnimatedAPI,
  AnimatedValue,
  AnimationConfig,
  SpringConfig,
} from '../types';
import type {
  StyleProp,
  TextProps,
  ViewProps,
} from '../types/react-native-props';
import type { ReactNativeStyleProperties } from '../types/platform-exports';

// Web equivalents for React Native components that don't have direct Tamagui equivalents

// Helper function to flatten style arrays - still needed for some components
const flattenStyles = (style?: StyleProp): ReactNativeStyleProperties => {
  if (!style) return {};
  if (Array.isArray(style)) {
    const filtered = style.filter(
      (s) => s != null && typeof s === 'object',
    ) as ReactNativeStyleProperties[];
    return filtered.reduce((acc, s) => ({ ...acc, ...s }), {});
  }
  return style;
};

interface TouchableOpacityProps {
  style?: StyleProp;
  children?: React.ReactNode;
  onPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  activeOpacity?: number;
  disabled?: boolean;
  className?: string;
}

// Simple TouchableOpacity implementation for web
function TouchableOpacity({
  style,
  children,
  onPress,
  onPressIn,
  onPressOut,
  activeOpacity = 0.7,
  disabled,
  className,
}: TouchableOpacityProps) {
  const flatStyle = flattenStyles(style);

  return (
    <div
      onClick={disabled ? undefined : onPress}
      onMouseDown={onPressIn}
      onMouseUp={onPressOut}
      className={className}
      style={{
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'opacity 0.2s ease',
        ...flatStyle,
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.opacity = activeOpacity.toString();
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          e.currentTarget.style.opacity = '1';
        }
      }}
    >
      {children}
    </div>
  );
}

const StyleSheet = {
  create: <T extends Record<string, React.CSSProperties>>(styles: T): T =>
    styles,
};

// Declare StyleSheet as a global for web platform
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
  (window as any).StyleSheet = StyleSheet;
}

// Also make it available on globalThis for better compatibility
if (typeof globalThis !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
  (globalThis as any).StyleSheet = StyleSheet;
}

const Platform = {
  OS: 'web' as 'web' | 'ios' | 'android',
  Version: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
  select: function <T>(specifics: {
    web?: T;
    default?: T;
    [key: string]: T | undefined;
  }): T | undefined {
    return specifics.web ?? specifics.default;
  },
};

const Dimensions = {
  get: (dimension: 'window' | 'screen') => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 375,
    height: typeof window !== 'undefined' ? window.innerHeight : 667,
  }),
  addEventListener: (event: string, handler: (...args: unknown[]) => void) => {
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handler as EventListener);
    }
  },
  removeEventListener: (
    event: string,
    handler: (...args: unknown[]) => void,
  ) => {
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

// ActivityIndicator component for web
interface ActivityIndicatorProps {
  size?: 'small' | 'large' | number;
  color?: string;
  animating?: boolean;
  style?: React.CSSProperties;
}

function ActivityIndicator({
  size = 'small',
  color = '#007AFF',
  animating = true,
  style,
}: ActivityIndicatorProps) {
  const spinnerSize =
    typeof size === 'number' ? size : size === 'large' ? 36 : 20;

  if (!animating) return null;

  return (
    <div
      style={{
        width: spinnerSize,
        height: spinnerSize,
        border: `${Math.max(2, spinnerSize / 10)}px solid ${color}20`,
        borderTop: `${Math.max(2, spinnerSize / 10)}px solid ${color}`,
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
        ...style,
      }}
    />
  );
}

// FlatList component for web
interface FlatListProps<ItemT> {
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
  ListHeaderComponent?:
    | React.ComponentType<unknown>
    | React.ReactElement
    | null;
  ListFooterComponent?:
    | React.ComponentType<unknown>
    | React.ReactElement
    | null;
  ListEmptyComponent?: React.ComponentType<unknown> | React.ReactElement | null;
  showsHorizontalScrollIndicator?: boolean;
  showsVerticalScrollIndicator?: boolean;
  columnWrapperStyle?: React.CSSProperties;
  stickyHeaderIndices?: number[];
  scrollEnabled?: boolean;
  keyboardShouldPersistTaps?: string;
  ItemSeparatorComponent?:
    | React.ComponentType<unknown>
    | React.ReactElement
    | null;
}

function FlatList<ItemT>({
  data,
  renderItem,
  keyExtractor,
  style,
  numColumns = 1,
  horizontal = false,
  contentContainerStyle,
  onEndReached,
  onEndReachedThreshold = 0.1,
  ListHeaderComponent,
  ListFooterComponent,
  ListEmptyComponent,
  showsHorizontalScrollIndicator = true,
  showsVerticalScrollIndicator = true,
  columnWrapperStyle,
  stickyHeaderIndices,
  scrollEnabled = true,
  keyboardShouldPersistTaps,
  ItemSeparatorComponent,
}: FlatListProps<ItemT>) {
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!onEndReached) return;

    const handleScroll = () => {
      const container = containerRef.current;
      if (!container) return;

      const { scrollTop, scrollHeight, clientHeight } = container;
      const scrollPercent = (scrollTop + clientHeight) / scrollHeight;

      if (scrollPercent >= 1 - onEndReachedThreshold) {
        onEndReached();
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [onEndReached, onEndReachedThreshold]);

  const renderComponent = (
    Component:
      | React.ComponentType<unknown>
      | React.ReactElement
      | null
      | undefined,
  ): React.ReactElement | null => {
    if (!Component) return null;
    if (React.isValidElement(Component)) return Component;
    if (typeof Component === 'function') return React.createElement(Component);
    return Component as React.ReactElement;
  };

  const containerStyle: React.CSSProperties = {
    overflow: 'auto',
    ...(horizontal ? { display: 'flex', flexDirection: 'row' } : {}),
    ...(numColumns > 1
      ? { display: 'grid', gridTemplateColumns: `repeat(${numColumns}, 1fr)` }
      : {}),
    // Handle scroll indicators
    ...(showsHorizontalScrollIndicator === false
      ? { scrollbarWidth: 'none', msOverflowStyle: 'none' }
      : {}),
    ...(showsVerticalScrollIndicator === false
      ? { scrollbarWidth: 'none', msOverflowStyle: 'none' }
      : {}),
    ...(flattenStyles(style as StyleProp) as React.CSSProperties),
  };

  const contentStyle: React.CSSProperties = {
    ...contentContainerStyle,
  };

  return (
    <div ref={containerRef} style={containerStyle}>
      <div style={contentStyle}>
        {renderComponent(ListHeaderComponent)}
        {data.length === 0 && renderComponent(ListEmptyComponent)}
        {data.map((item, index) => (
          <div
            key={keyExtractor ? keyExtractor(item, index) : index.toString()}
          >
            {renderItem({ item, index })}
          </div>
        ))}
        {renderComponent(ListFooterComponent)}
      </div>
    </div>
  );
}

// Modal component for web
interface ModalProps extends React.PropsWithChildren {
  visible: boolean;
  transparent?: boolean;
  animationType?: 'none' | 'slide' | 'fade';
  onRequestClose?: () => void;
  style?: React.CSSProperties;
}

function Modal({
  visible,
  transparent = false,
  animationType = 'none',
  onRequestClose,
  style,
  children,
}: ModalProps): React.ReactElement | null {
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onRequestClose) {
        onRequestClose();
      }
    };

    if (visible) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [visible, onRequestClose]);

  if (!visible) return null;

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: transparent ? 'transparent' : 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  };

  const modalStyle: React.CSSProperties = {
    backgroundColor: transparent ? 'transparent' : 'white',
    borderRadius: 8,
    padding: transparent ? 0 : 20,
    maxWidth: '90vw',
    maxHeight: '90vh',
    overflow: 'auto',
    ...style,
  };

  return (
    <div style={overlayStyle} onClick={onRequestClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// Basic Animated API for web
const Animated: AnimatedAPI = {
  View: ({
    style,
    ...props
  }: ViewProps & {
    style?:
      | React.CSSProperties
      | React.CSSProperties[]
      | (React.CSSProperties & { transform?: { scale: AnimatedValue }[] })[];
  }) => {
    // Handle animated values and complex style arrays
    const processedStyle = Array.isArray(style) ? flattenStyles(style) : style;
    return <div style={processedStyle} {...props} />;
  },
  Text: ({ style, ...props }: TextProps) => {
    // Handle style arrays for Text component
    const processedStyle = Array.isArray(style) ? flattenStyles(style) : style;
    return <span style={processedStyle} {...props} />;
  },
  Value: class implements AnimatedValue {
    private value: number;
    private listeners: Map<string, (value: { value: number }) => void> =
      new Map();
    private listenerCounter = 0;

    constructor(value: number) {
      this.value = value;
    }

    setValue(value: number) {
      this.value = value;
      this.listeners.forEach((listener) => listener({ value }));
    }

    getValue() {
      return this.value;
    }

    addListener(callback: (value: { value: number }) => void): string {
      const id = (this.listenerCounter++).toString();
      this.listeners.set(id, callback);
      return id;
    }

    removeListener(id: string) {
      this.listeners.delete(id);
    }

    removeAllListeners() {
      this.listeners.clear();
    }

    interpolate(config: {
      inputRange: number[];
      outputRange: (number | string)[];
      extrapolate?: 'extend' | 'clamp' | 'identity';
    }) {
      const { inputRange, outputRange, extrapolate = 'extend' } = config;
      return {
        __getValue: () => {
          const input = this.value;

          // Simple linear interpolation implementation
          for (let i = 0; i < inputRange.length - 1; i++) {
            if (input >= inputRange[i] && input <= inputRange[i + 1]) {
              const progress =
                (input - inputRange[i]) / (inputRange[i + 1] - inputRange[i]);
              const startValue = outputRange[i];
              const endValue = outputRange[i + 1];

              if (
                typeof startValue === 'number' &&
                typeof endValue === 'number'
              ) {
                return startValue + progress * (endValue - startValue);
              }
              return endValue; // For non-numeric values, just return the end value
            }
          }

          // Handle extrapolation
          if (extrapolate === 'clamp') {
            if (input <= inputRange[0]) return outputRange[0];
            if (input >= inputRange[inputRange.length - 1])
              return outputRange[outputRange.length - 1];
          }

          return outputRange[0]; // Fallback
        },
      };
    }
  },
  timing: (value: AnimatedValue, config: AnimationConfig) => ({
    start: (callback?: () => void) => {
      // Simple implementation - in reality you'd want proper animations
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      if (value && value.setValue) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        value.setValue(config.toValue);
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
      if (callback) setTimeout(callback, config.duration || 0);
    },
  }),
  spring: (value: AnimatedValue, config: SpringConfig) => ({
    start: (callback?: () => void) => {
      // Simple implementation - in reality you'd want proper animations
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      if (value && value.setValue) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        value.setValue(config.toValue);
      }
      if (callback) setTimeout(callback, 300);
    },
  }),
  parallel: (animations: { start: (callback?: () => void) => void }[]) => ({
    start: (callback?: () => void) => {
      // Start all animations in parallel and call callback when all are done
      let completedCount = 0;
      const total = animations.length;

      if (total === 0) {
        if (callback) callback();
        return;
      }

      animations.forEach((animation) => {
        animation.start(() => {
          completedCount++;
          if (completedCount === total && callback) {
            callback();
          }
        });
      });
    },
  }),
};

// Alert API for web
const Alert = {
  alert: (
    title: string,
    message?: string,
    buttons?: Array<{
      text?: string;
      onPress?: () => void;
      style?: 'default' | 'cancel' | 'destructive';
    }>,
  ) => {
    if (buttons && buttons.length > 0) {
      if (window.confirm(`${title}\n${message || ''}`)) {
        const okButton = buttons.find((b) => b.style !== 'cancel');
        if (okButton && okButton.onPress) okButton.onPress();
      } else {
        const cancelButton = buttons.find((b) => b.style === 'cancel');
        if (cancelButton && cancelButton.onPress) cancelButton.onPress();
      }
    } else {
      window.alert(`${title}\n${message || ''}`);
    }
  },
};

// SafeAreaView component for web
function SafeAreaView({
  style,
  children,
  ...props
}: React.HTMLProps<HTMLDivElement>) {
  return (
    <div
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

// Vibration API for web (no-op since web doesn't support vibration)
const Vibration = {
  vibrate: (pattern?: number | number[]) => {
    // No-op for web, or could use navigator.vibrate if available
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern || 0);
    }
  },
  cancel: () => {
    // No-op for web
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(0);
    }
  },
};

// KeyboardAvoidingView component for web (simplified)
interface KeyboardAvoidingViewProps {
  style?:
    | React.CSSProperties
    | React.CSSProperties[]
    | false
    | null
    | undefined;
  children?: React.ReactNode;
  behavior?: 'height' | 'position' | 'padding';
  keyboardVerticalOffset?: number;
  enabled?: boolean;
}

function KeyboardAvoidingView({
  style,
  children,
  behavior = 'padding',
  keyboardVerticalOffset = 0,
  enabled = true,
  ...props
}: KeyboardAvoidingViewProps) {
  // For web, we can just render a div since keyboard handling is different
  return (
    <div
      style={flattenStyles(style as StyleProp) as React.CSSProperties}
      {...props}
    >
      {children}
    </div>
  );
}

// Picker component for web compatibility
interface PickerProps {
  selectedValue?: string | number;
  onValueChange?: (value: string | number, index: number) => void;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  enabled?: boolean;
  dropdownIconColor?: string;
}

interface PickerItemProps {
  label: string;
  value: string | number;
  color?: string;
  testID?: string;
}

function Picker({
  selectedValue,
  onValueChange,
  style,
  children,
  enabled = true,
  dropdownIconColor,
}: PickerProps) {
  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    const index = event.target.selectedIndex;
    if (onValueChange) {
      // Try to parse as number if possible, otherwise keep as string
      const parsedValue = isNaN(Number(value)) ? value : Number(value);
      onValueChange(parsedValue, index);
    }
  };

  return (
    <select
      value={selectedValue}
      onChange={handleChange}
      disabled={!enabled}
      style={{
        padding: '8px',
        borderRadius: '4px',
        border: '1px solid #ccc',
        fontSize: '16px',
        backgroundColor: 'white',
        ...style,
        ...(dropdownIconColor && { color: dropdownIconColor }),
      }}
    >
      {children}
    </select>
  );
}

// Picker.Item component
function PickerItem({ label, value, color, testID }: PickerItemProps) {
  return (
    <option value={value} style={{ color }} data-testid={testID}>
      {label}
    </option>
  );
}

Picker.Item = PickerItem;

// Image component for web
function Image({
  source,
  style,
  alt = '',
  ...props
}: {
  source: { uri: string } | number;
  style?: React.CSSProperties;
  alt?: string;
  [key: string]: unknown;
}) {
  const src =
    typeof source === 'object' && 'uri' in source ? source.uri : source;
  return (
    <img
      src={src as string}
      alt={alt}
      style={{
        maxWidth: '100%',
        height: 'auto',
        ...style,
      }}
      {...props}
    />
  );
}

// Pressable component (alias for TouchableOpacity on web)
const Pressable = TouchableOpacity;

// Basic View component for web
function View({
  style,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  style?: React.CSSProperties | React.CSSProperties[];
}) {
  return (
    <div
      style={flattenStyles(style as StyleProp) as React.CSSProperties}
      {...props}
    >
      {children}
    </div>
  );
}

// Basic Text component for web
function Text({
  style,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  style?: React.CSSProperties | React.CSSProperties[];
}) {
  return (
    <span
      style={flattenStyles(style as StyleProp) as React.CSSProperties}
      {...props}
    >
      {children}
    </span>
  );
}

// ScrollView component for web
interface ScrollViewProps {
  style?: React.CSSProperties | React.CSSProperties[];
  children?: React.ReactNode;
  horizontal?: boolean;
  showsVerticalScrollIndicator?: boolean;
  showsHorizontalScrollIndicator?: boolean;
  contentContainerStyle?: React.CSSProperties;
  [key: string]: unknown;
}

function ScrollView({
  style,
  children,
  horizontal = false,
  showsVerticalScrollIndicator = true,
  showsHorizontalScrollIndicator = true,
  contentContainerStyle,
  ...props
}: ScrollViewProps) {
  const flatStyle = flattenStyles(style as StyleProp);

  return (
    <div
      style={{
        overflow: 'auto',
        ...(!showsVerticalScrollIndicator && {
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }),
        ...(!showsHorizontalScrollIndicator && {
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }),
        ...(horizontal && {
          overflowX: 'auto',
          overflowY: 'hidden',
          whiteSpace: 'nowrap',
        }),
        ...(flatStyle as React.CSSProperties),
      }}
      {...props}
    >
      <div style={contentContainerStyle}>{children}</div>
    </div>
  );
}

// TextInput component for web
interface TextInputProps {
  style?: React.CSSProperties | React.CSSProperties[];
  value?: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
  autoFocus?: boolean;
  editable?: boolean;
  keyboardType?: string;
  returnKeyType?: string;
  onSubmitEditing?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  [key: string]: unknown;
}

function TextInput({
  style,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  multiline = false,
  numberOfLines = 1,
  autoFocus = false,
  editable = true,
  onSubmitEditing,
  onFocus,
  onBlur,
  ...props
}: TextInputProps) {
  const flatStyle = flattenStyles(style as StyleProp);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    onChangeText?.(e.target.value);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !multiline) {
      onSubmitEditing?.();
    }
  };

  const inputStyle = {
    border: '1px solid #ccc',
    borderRadius: '4px',
    padding: '8px',
    fontSize: '16px',
    outline: 'none',
    ...(flatStyle as React.CSSProperties),
  };

  if (multiline) {
    return (
      <textarea
        style={{
          ...inputStyle,
          resize: 'vertical',
          minHeight: numberOfLines ? numberOfLines * 20 : undefined,
        }}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={!editable}
        onFocus={onFocus}
        onBlur={onBlur}
        {...props}
      />
    );
  }

  return (
    <input
      type={secureTextEntry ? 'password' : 'text'}
      style={inputStyle}
      value={value}
      onChange={handleChange}
      onKeyPress={handleKeyPress}
      placeholder={placeholder}
      autoFocus={autoFocus}
      disabled={!editable}
      onFocus={onFocus}
      onBlur={onBlur}
      {...props}
    />
  );
}

// Table component for web
interface TableProps {
  style?: React.CSSProperties;
  children?: React.ReactNode;
  [key: string]: unknown;
}

function Table({ style, children, ...props }: TableProps) {
  return (
    <table
      style={{
        borderCollapse: 'collapse',
        width: '100%',
        ...style,
      }}
      {...props}
    >
      {children}
    </table>
  );
}

// PlatformProviders - a simple wrapper for web
interface PlatformProvidersProps {
  children?: React.ReactNode;
}

function PlatformProviders({ children }: PlatformProvidersProps) {
  // On web, this is just a passthrough
  return children;
}

// PlatformUtils - utility functions for platform-specific operations
const PlatformUtils = {
  isWeb: true,
  isNative: false,
  OS: 'web' as const,
  select: <T,>(specifics: { web?: T; native?: T; default?: T }) => {
    return specifics.web ?? specifics.default;
  },
};

// Named exports - only components without direct Tamagui equivalents
export {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Picker,
  Platform,
  PlatformProviders,
  PlatformUtils,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Table,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
};

// Update the default export to include only the necessary components
const ReactNativeEquivalents = {
  ActivityIndicator,
  Alert,
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  Animated,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Picker,
  Platform,
  PlatformProviders,
  PlatformUtils,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Table,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
};

export default ReactNativeEquivalents;

// Export types
export type { TouchableOpacityProps, FlatListProps };
