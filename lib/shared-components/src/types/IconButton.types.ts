import type { ButtonProps as TamaguiButtonProps } from 'tamagui';

/**
 * Icon button size variants
 */
export type IconButtonSize = 'sm' | 'md' | 'lg';

/**
 * Icon button visual variants
 */
export type IconButtonVariant = 'default' | 'primary' | 'secondary' | 'accent';

/**
 * Color scheme options for gradient effects
 */
export type IconButtonColorScheme =
  | 'blue'
  | 'purple'
  | 'green'
  | 'red'
  | 'gold';

/**
 * Props for the IconButton component
 */
export interface IconButtonProps extends Omit<
  TamaguiButtonProps,
  'variant' | 'icon'
> {
  /**
   * Icon name to display - should match available icons in the platform-specific Icon component
   */
  icon: string;

  /**
   * Optional text label to display below the icon
   */
  label?: string;

  /**
   * Size of the icon button
   * @default 'md'
   */
  size?: IconButtonSize;

  /**
   * Visual variant of the button
   * @default 'default'
   */
  variant?: IconButtonVariant;

  /**
   * Color scheme for the gradient effect
   * @default 'blue'
   */
  colorScheme?: IconButtonColorScheme;

  /**
   * Whether to show the gradient shadow effect on hover
   * @default true
   */
  showGradient?: boolean;

  /**
   * Accessibility label for screen readers
   */
  accessibilityLabel?: string;

  /**
   * Test ID for testing purposes
   */
  testID?: string;
}

/**
 * Style variant mappings for Tamagui styled components
 */
export interface IconButtonStyleVariants {
  size: {
    [key in IconButtonSize]: {
      width: number;
      height: number;
      padding: number;
    };
  };

  variant: {
    [key in IconButtonVariant]: {
      backgroundColor: string;
      hoverStyle: {
        backgroundColor: string;
        scale: number;
      };
      pressStyle: {
        backgroundColor: string;
        scale: number;
      };
    };
  };

  showGradient: {
    true: {
      shadowColor: string;
      shadowOffset: { width: number; height: number };
      shadowOpacity: number;
      shadowRadius: number;
      elevation: number;
      hoverStyle: {
        shadowOffset: { width: number; height: number };
        shadowOpacity: number;
        shadowRadius: number;
        elevation: number;
      };
    };
  };
}

/**
 * Gradient overlay style variants
 */
export interface GradientOverlayVariants {
  colorScheme: {
    [key in IconButtonColorScheme]: {
      backgroundColor: string;
    };
  };
}
