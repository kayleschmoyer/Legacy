import type { ButtonProps as TamaguiButtonProps } from 'tamagui';

/** Size variants for the IconButton component. */
export type IconButtonSize = 'sm' | 'md' | 'lg';

/**
 * Visual variant options for IconButton.
 *
 * - `default`  — surface-card background with outline border; secondary actions
 * - `primary`  — brand navy background; primary interactive actions
 * - `seam`     — seam-red background; destructive / alert actions
 * - `gold`     — heritage-gold background; achievement / premium states
 * - `ghost`    — transparent background with navy hover; low-emphasis actions
 */
export type IconButtonVariant =
  | 'default'
  | 'primary'
  | 'seam'
  | 'gold'
  | 'ghost';

/** Props for the IconButton component. */
export interface IconButtonProps extends Omit<
  TamaguiButtonProps,
  'variant' | 'icon' | 'size'
> {
  /** Icon name passed to the platform Icon component (e.g. `'home'`, `'star'`). */
  icon: string;

  /**
   * Optional label rendered inline beside the icon (Big Shoulders Display 700
   * 13 px). When present the button expands to auto-width with `padding: 0 14px`
   * and `border-radius` collapses from 14 px to 12 px.
   */
  label?: string;

  /**
   * Button dimensions — sm 36×36, md 44×44, lg 56×56 (icon 14/18/22 px).
   * @default 'md'
   */
  size?: IconButtonSize;

  /**
   * Visual treatment applied to the button surface.
   * @default 'default'
   */
  variant?: IconButtonVariant;

  /** Accessibility label for screen readers. Falls back to `label` then `"<icon> button"`. */
  accessibilityLabel?: string;

  /** Test ID for automated testing selectors. */
  testID?: string;
}
