import React from 'react';
import { Button as TamaguiButton, Text } from 'tamagui';
import { Icon } from './platform-components';
import type {
  IconButtonProps,
  IconButtonSize,
  IconButtonVariant,
} from './types/IconButton.types';

interface VariantStyle {
  bg: string;
  fg: string;
  border: string;
  bgHover: string;
}

const VARIANT_STYLES: Record<IconButtonVariant, VariantStyle> = {
  default: {
    bg: '$color3',
    fg: '$color11',
    border: '$borderColor',
    bgHover: '$color4',
  },
  primary: {
    bg: '$brandNavy',
    fg: '#FFFFFF',
    border: '$brandNavyLight',
    bgHover: '$brandNavyLight',
  },
  seam: {
    bg: '$brandSeamRed',
    fg: '#FFFFFF',
    border: '$brandSeamRedLight',
    bgHover: '$brandSeamRedLight',
  },
  gold: {
    bg: '$brandGold',
    fg: '#111111',
    border: '$brandGoldDark',
    bgHover: '$brandGoldLight',
  },
  ghost: {
    bg: 'transparent',
    fg: '$color11',
    border: 'transparent',
    bgHover: '$surfaceInteractive',
  },
};

const SIZE_DIMS: Record<
  IconButtonSize,
  { width: number; height: number; iconSize: number }
> = {
  sm: { width: 36, height: 36, iconSize: 14 },
  md: { width: 44, height: 44, iconSize: 18 },
  lg: { width: 56, height: 56, iconSize: 22 },
};

function IconButton({
  icon,
  label,
  size = 'md',
  variant = 'default',
  disabled,
  accessibilityLabel,
  testID,
  ...props
}: IconButtonProps) {
  const styles = VARIANT_STYLES[variant];
  const dims = SIZE_DIMS[size];
  const hasLabel = Boolean(label);
  const isDisabled = Boolean(disabled);

  return (
    <TamaguiButton
      backgroundColor={styles.bg}
      color={styles.fg}
      borderColor={styles.border}
      borderWidth={1}
      width={hasLabel ? undefined : dims.width}
      height={dims.height}
      paddingHorizontal={hasLabel ? 14 : 0}
      paddingVertical={0}
      gap={hasLabel ? 8 : 0}
      borderRadius={hasLabel ? 12 : 14}
      alignItems="center"
      justifyContent="center"
      hoverStyle={isDisabled ? undefined : { backgroundColor: styles.bgHover }}
      pressStyle={isDisabled ? undefined : { scale: 0.96 as const }}
      animation="quick"
      disabled={isDisabled}
      accessibilityLabel={accessibilityLabel ?? label ?? `${icon} button`}
      testID={testID}
      {...props}
    >
      <Icon name={icon} size={dims.iconSize} color={styles.fg} />
      {hasLabel && (
        <Text
          fontFamily="$heading"
          fontWeight="700"
          fontSize={13}
          letterSpacing={0.52}
          color={styles.fg}
        >
          {label}
        </Text>
      )}
    </TamaguiButton>
  );
}

export { IconButton };
