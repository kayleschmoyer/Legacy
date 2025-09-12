import React from 'react';

// Helper function to flatten style arrays
const flattenStyles = (
  style?: React.CSSProperties | React.CSSProperties[],
): React.CSSProperties => {
  if (!style) return {};
  if (Array.isArray(style)) {
    return style.reduce((acc, s) => ({ ...acc, ...s }), {});
  }
  return style;
};

// Web equivalents for React Native components
function View({
  style,
  children,
  ...props
}: React.HTMLProps<HTMLDivElement> & {
  style?: React.CSSProperties | React.CSSProperties[];
}) {
  return (
    <div style={flattenStyles(style)} {...props}>
      {children}
    </div>
  );
}

interface TextProps extends Omit<React.HTMLProps<HTMLSpanElement>, 'style'> {
  style?: React.CSSProperties | React.CSSProperties[];
  numberOfLines?: number;
}

function Text({ style, numberOfLines, children, ...props }: TextProps) {
  const flatStyle = flattenStyles(style);
  const textStyle: React.CSSProperties = {
    ...flatStyle,
    ...(numberOfLines && {
      display: '-webkit-box',
      WebkitBoxOrient: 'vertical',
      WebkitLineClamp: numberOfLines,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    }),
  };

  return (
    <span style={textStyle} {...props}>
      {children}
    </span>
  );
}

interface ScrollViewProps {
  style?: React.CSSProperties;
  contentContainerStyle?: React.CSSProperties;
  children?: React.ReactNode;
  className?: string;
  showsVerticalScrollIndicator?: boolean;
  showsHorizontalScrollIndicator?: boolean;
  horizontal?: boolean;
}

function ScrollView({
  style,
  children,
  contentContainerStyle,
  className,
  showsVerticalScrollIndicator = true,
  showsHorizontalScrollIndicator = true,
  horizontal = false,
}: ScrollViewProps) {
  return (
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
}

interface TouchableOpacityProps {
  style?: React.CSSProperties | React.CSSProperties[];
  children?: React.ReactNode;
  onPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  activeOpacity?: number;
  disabled?: boolean;
  className?: string;
}

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
  return (
    <button
      type="button"
      disabled={disabled}
      className={className}
      style={{
        background: 'none',
        border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        ...flattenStyles(style),
      }}
      onClick={disabled ? undefined : onPress}
      onMouseDown={
        disabled
          ? undefined
          : (e) => {
              (e.target as HTMLElement).style.opacity =
                activeOpacity.toString();
              onPressIn?.();
            }
      }
      onMouseUp={
        disabled
          ? undefined
          : (e) => {
              (e.target as HTMLElement).style.opacity = '1';
              onPressOut?.();
            }
      }
      onMouseLeave={
        disabled
          ? undefined
          : (e) => {
              (e.target as HTMLElement).style.opacity = '1';
              onPressOut?.();
            }
      }
    >
      {children}
    </button>
  );
}

function ActivityIndicator({
  size = 'small',
  color = '#007AFF',
  style,
}: {
  size?: 'small' | 'large';
  color?: string;
  style?: React.CSSProperties;
}) {
  return (
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
}

interface TextInputProps {
  ref?: React.RefObject<any>;
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
  onSubmitEditing?: () => void;
  returnKeyType?: string;
}

function TextInput({
  ref,
  style,
  onChangeText,
  multiline,
  placeholder,
  placeholderTextColor,
  value,
  defaultValue,
  disabled,
  className,
  onFocus,
  onBlur,
  autoFocus,
  autoCapitalize,
  keyboardType,
  secureTextEntry,
  editable = true,
  autoComplete,
  autoCorrect,
  onSubmitEditing,
  returnKeyType,
}: TextInputProps) {
  const flatStyle = flattenStyles(style);

  const commonProps = {
    className,
    placeholder,
    value,
    defaultValue,
    disabled: disabled || !editable,
    style: {
      padding: '8px',
      border: '1px solid #ccc',
      borderRadius: '4px',
      ...flatStyle,
      // Note: placeholderTextColor requires CSS-in-JS or styled-components for full support
      // For now, we'll apply it via inline styles when possible
    },
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      onChangeText?.(e.target.value);
    },
    onFocus,
    onBlur,
    autoFocus,
  };

  return multiline ? (
    <textarea
      ref={ref}
      {...commonProps}
      autoComplete={autoComplete}
      spellCheck={autoCorrect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && returnKeyType === 'search') {
          onSubmitEditing?.();
        }
      }}
    />
  ) : (
    <input
      ref={ref}
      {...commonProps}
      type={secureTextEntry ? 'password' : 'text'}
      inputMode={
        keyboardType === 'email-address'
          ? 'email'
          : keyboardType === 'numeric'
            ? 'numeric'
            : undefined
      }
      autoCapitalize={autoCapitalize}
      autoComplete={autoComplete}
      spellCheck={autoCorrect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (returnKeyType === 'search' || returnKeyType === 'done')) {
          onSubmitEditing?.();
        }
      }}
    />
  );
}

export const StyleSheet = {
  create: <T extends Record<string, React.CSSProperties>>(styles: T): T =>
    styles,
};

// Declare StyleSheet as a global for web platform
if (typeof window !== 'undefined') {
  (window as any).StyleSheet = StyleSheet;
}

// Also make it available on globalThis for better compatibility
if (typeof globalThis !== 'undefined') {
  (globalThis as any).StyleSheet = StyleSheet;
}

export const Platform = {
  OS: 'web' as 'web' | 'ios' | 'android',
  Version: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
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
  ListHeaderComponent?: React.ComponentType<any> | React.ReactElement | null;
  ListFooterComponent?: React.ComponentType<any> | React.ReactElement | null;
  ListEmptyComponent?: React.ComponentType<any> | React.ReactElement | null;
  showsHorizontalScrollIndicator?: boolean;
  showsVerticalScrollIndicator?: boolean;
  columnWrapperStyle?: React.CSSProperties;
  stickyHeaderIndices?: number[];
  scrollEnabled?: boolean;
  keyboardShouldPersistTaps?: string;
  ItemSeparatorComponent?: React.ComponentType<any> | React.ReactElement | null;
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
    Component: React.ComponentType<any> | React.ReactElement | null | undefined,
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
    ...flattenStyles(style),
  };

  const contentStyle: React.CSSProperties = {
    ...(contentContainerStyle as React.CSSProperties),
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
    ...(style as React.CSSProperties),
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
export const Animated = {
  View: ({ style, ...props }: any) => <div style={style} {...props} />,
  Text: ({ style, ...props }: any) => <span style={style} {...props} />,
  Value: class {
    constructor(private value: number) {}
    setValue(value: number) {
      this.value = value;
    }
    getValue() {
      return this.value;
    }
    addListener(listener: (state: { value: number }) => void) {
      // In a real implementation, you'd want to track listeners
    }
    removeAllListeners() {
      // Empty implementation for web
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
  timing: (value: any, config: any) => ({
    start: (callback?: () => void) => {
      // Simple implementation - in reality you'd want proper animations
      if (callback) setTimeout(callback, config.duration || 0);
    },
  }),
  spring: (value: any, config: any) => ({
    start: (callback?: () => void) => {
      if (callback) setTimeout(callback, 300);
    },
  }),
  parallel: (animations: any[]) => ({
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
export const Alert = {
  alert: (title: string, message?: string, buttons?: any[]) => {
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
        ...(style as React.CSSProperties),
      }}
      {...props}
    >
      {children}
    </div>
  );
}

// Vibration API for web (no-op since web doesn't support vibration)
export const Vibration = {
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
  style?: React.CSSProperties;
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
    <div style={style} {...props}>
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

// Named exports for compatibility
export {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Picker,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
};

// Update the default export to include new components
const ReactNativeEquivalents = {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Picker,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
};

export default ReactNativeEquivalents;

// Export types
export type { TouchableOpacityProps, FlatListProps, ScrollViewProps };
