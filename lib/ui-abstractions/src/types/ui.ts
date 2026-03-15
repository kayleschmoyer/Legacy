import type { ComponentRef, ReactNode } from 'react';
import { TextInput } from 'react-native';
import type {
  TamaguiElement,
  ScrollView as TamaguiScrollView,
  TamaguiTextElement,
} from 'tamagui';

// Core common props that all UI components should support
export interface BaseUIProps {
  children?: ReactNode;
  testID?: string;
  accessibilityLabel?: string;
  id?: string;
}

// Spacing and sizing types
export type SpacingValue = number | string;
export type SizeValue = number | string;

// Common layout props
export interface LayoutProps extends BaseUIProps {
  flex?: number;
  flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  justifyContent?:
    | 'flex-start'
    | 'flex-end'
    | 'center'
    | 'space-between'
    | 'space-around'
    | 'space-evenly';
  alignItems?: 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline';
  alignSelf?:
    | 'auto'
    | 'flex-start'
    | 'flex-end'
    | 'center'
    | 'stretch'
    | 'baseline';
  width?: SizeValue;
  height?: SizeValue;
  minWidth?: SizeValue;
  minHeight?: SizeValue;
  maxWidth?: SizeValue;
  maxHeight?: SizeValue;
  margin?: SpacingValue;
  marginTop?: SpacingValue;
  marginRight?: SpacingValue;
  marginBottom?: SpacingValue;
  marginLeft?: SpacingValue;
  marginHorizontal?: SpacingValue;
  marginVertical?: SpacingValue;
  padding?: SpacingValue;
  paddingTop?: SpacingValue;
  paddingRight?: SpacingValue;
  paddingBottom?: SpacingValue;
  paddingLeft?: SpacingValue;
  paddingHorizontal?: SpacingValue;
  paddingVertical?: SpacingValue;
  position?: 'absolute' | 'relative' | 'static';
  top?: SpacingValue;
  right?: SpacingValue;
  bottom?: SpacingValue;
  left?: SpacingValue;
  zIndex?: number;
}

// Text props
export interface TextProps extends BaseUIProps {
  color?: string;
  fontSize?: number | string;
  fontWeight?:
    | 'normal'
    | 'bold'
    | '100'
    | '200'
    | '300'
    | '400'
    | '500'
    | '600'
    | '700'
    | '800'
    | '900';
  fontFamily?: string;
  lineHeight?: number | string;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  textDecoration?: 'none' | 'underline' | 'line-through';
  numberOfLines?: number;
  selectable?: boolean;
}

// Button props
export interface ButtonProps extends BaseUIProps, LayoutProps {
  title?: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'link';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  onPress?: () => void;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
}

// Input props
export interface InputProps extends BaseUIProps, LayoutProps {
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  placeholderTextColor?: string;
  onChangeText?: (text: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  editable?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
  maxLength?: number;
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  secureTextEntry?: boolean;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
}

// View props
export interface ViewProps extends BaseUIProps, LayoutProps {
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  opacity?: number;
  overflow?: 'visible' | 'hidden' | 'scroll';
  onPress?: () => void;
  onLayout?: (event: {
    nativeEvent: {
      layout: { x: number; y: number; width: number; height: number };
    };
  }) => void;
}

// ScrollView props
export interface ScrollViewProps extends ViewProps {
  horizontal?: boolean;
  showsHorizontalScrollIndicator?: boolean;
  showsVerticalScrollIndicator?: boolean;
  scrollEnabled?: boolean;
  onScroll?: (event: any) => void;
  contentContainerStyle?: any;
}

// Stack props (for XStack/YStack)
export interface StackProps extends ViewProps {
  space?: SpacingValue;
  separator?: ReactNode;
}

// Theme colors and tokens
export interface UITheme {
  colors: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    success: string;
    warning: string;
    error: string;
    disabled: string;
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  typography: {
    sizes: {
      xs: number;
      sm: number;
      md: number;
      lg: number;
      xl: number;
      xxl: number;
    };
    weights: {
      normal: string;
      medium: string;
      semibold: string;
      bold: string;
    };
  };
  radii: {
    sm: number;
    md: number;
    lg: number;
    full: number;
  };
}

// Theme context types
export interface UIThemeContextValue {
  theme: UITheme;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
}

// Component ref types — use platform-accurate types to avoid `as any` casts
export type ViewRef = TamaguiElement;
export type TextRef = TamaguiTextElement;
export type ButtonRef = TamaguiElement;
export type InputRef = TextInput;
export type ScrollViewRef = ComponentRef<typeof TamaguiScrollView>;
