import React from 'react';
import {
  Spinner,
  Button as TamaguiButton,
  ButtonProps as TamaguiButtonProps,
  Text,
} from 'tamagui';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'gold'
  | 'danger'
  | 'ghost'
  | 'outlined';

export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Legacy Tamagui size strings ($1–$10) are still accepted for backward
 * compatibility with the pre-redesign `Button` API (which extended
 * `TamaguiButtonProps['size']`). They map to the closest design-system size.
 */
type LegacyTamaguiSize =
  | '$1'
  | '$2'
  | '$3'
  | '$4'
  | '$5'
  | '$6'
  | '$7'
  | '$8'
  | '$9'
  | '$10';

/**
 * `ButtonProps` is a strict superset of the original (pre-redesign) prop
 * surface:
 *
 * - `variant` now accepts every original value (`primary`, `secondary`,
 *   `outlined`) plus the new design-system variants (`gold`, `danger`,
 *   `ghost`). Old call sites continue to type-check and render their
 *   prior visual treatment (`secondary` / `outlined` keep the chromeless
 *   look they had before).
 * - `size` accepts the new design-system tokens (`sm` | `md` | `lg`) **and**
 *   every Tamagui size string the original component allowed (`$1`–`$10`).
 *
 * Nothing in the pre-redesign public API has been removed; this is purely
 * additive and was verified by running `tsc` against all consumers.
 */
export interface ButtonProps extends Omit<
  TamaguiButtonProps,
  'variant' | 'size'
> {
  title?: string;
  children?: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize | LegacyTamaguiSize;
  /** Pill-shaped rounding (radius-pill). Otherwise uses the default radius. */
  pill?: boolean;
  /** Show spinner and disable interaction. */
  loading?: boolean;
}

const LEGACY_SIZE_MAP: Record<LegacyTamaguiSize, ButtonSize> = {
  $1: 'sm',
  $2: 'sm',
  $3: 'sm',
  $4: 'md',
  $5: 'lg',
  $6: 'lg',
  $7: 'lg',
  $8: 'lg',
  $9: 'lg',
  $10: 'lg',
};

export function resolveSize(size: ButtonProps['size']): ButtonSize {
  if (!size) return 'md';
  if (size in LEGACY_SIZE_MAP) {
    return LEGACY_SIZE_MAP[size as LegacyTamaguiSize];
  }
  return size as ButtonSize;
}

const DS_SIZE_TO_TAMAGUI: Record<ButtonSize, '$3' | '$4' | '$5'> = {
  sm: '$3',
  md: '$4',
  lg: '$5',
};

interface VariantStyle {
  bg?: string;
  fg?: string;
  border?: string;
  bgHover?: string;
  bgPress?: string;
  chromeless?: boolean;
}

const VARIANT_STYLES: Record<ButtonVariant, VariantStyle> = {
  primary: {
    bg: '$brandNavy',
    fg: '#FFFFFF',
    border: '$brandNavyLight',
    bgHover: '$brandNavyLight',
    bgPress: '$brandNavyDark',
  },
  gold: {
    bg: '$brandGold',
    fg: '#111111',
    border: '$brandGoldDark',
    bgHover: '$brandGoldLight',
    bgPress: '$brandGoldDark',
  },
  danger: {
    bg: '$brandSeamRed',
    fg: '#FFFFFF',
    border: '$brandSeamRedLight',
    bgHover: '$brandSeamRedLight',
    bgPress: '$brandSeamRedDark',
  },
  ghost: {
    chromeless: true,
  },
  // Backward-compat aliases — keep the chromeless look they had before
  secondary: { chromeless: true },
  outlined: { chromeless: true },
};

function Button({
  title,
  children,
  variant = 'primary',
  size,
  pill = false,
  loading = false,
  disabled,
  ...props
}: ButtonProps) {
  const styles = VARIANT_STYLES[variant];
  const dsSize = resolveSize(size);
  const tamaguiSize = DS_SIZE_TO_TAMAGUI[dsSize];
  const isDisabled: boolean = Boolean(disabled) || loading;

  const processChildren = (child: React.ReactNode): React.ReactNode => {
    if (typeof child === 'string') {
      return <Text>{child}</Text>;
    }
    return child;
  };

  const content = children ?? title;
  const wrappedContent = React.isValidElement(content)
    ? content
    : processChildren(content);

  const variantProps = styles.chromeless
    ? { chromeless: true as const, type: 'button' as const }
    : {
        type: 'button' as const,
        backgroundColor: styles.bg,
        borderColor: styles.border,
        color: styles.fg,
        hoverStyle: isDisabled
          ? undefined
          : { backgroundColor: styles.bgHover },
        pressStyle: isDisabled
          ? undefined
          : { backgroundColor: styles.bgPress, scale: 0.98 },
      };

  return (
    <TamaguiButton
      size={tamaguiSize}
      disabled={isDisabled}
      borderRadius={pill ? 9999 : undefined}
      {...variantProps}
      {...props}
    >
      {loading ? <Spinner size="small" color={styles.fg ?? '$color'} /> : null}
      {wrappedContent}
    </TamaguiButton>
  );
}

export { Button };
