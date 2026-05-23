import React from 'react';
import { Separator as TamaguiSeparator, Text, XStack, YStack } from 'tamagui';
import type { GetProps } from 'tamagui';

export type SeparatorVariant = 'default' | 'strong' | 'subtle';

export interface SeparatorProps extends Omit<
  GetProps<typeof TamaguiSeparator>,
  'children'
> {
  /** Orientation. Defaults to horizontal. */
  vertical?: boolean;
  /**
   * Visual weight of the separator.
   * - `default` — 1px, standard card/list divider (`--outline-default`)
   * - `strong`  — 2px, section breaks and table headers (`--outline-strong`)
   * - `subtle`  — 1px, tight-density stat rows (`--outline-subtle`)
   */
  variant?: SeparatorVariant;
  /** Optional centered label (horizontal only). Renders an "OR" rule. */
  label?: string;
}

const variantColor: Record<SeparatorVariant, string> = {
  default: '$outlineStrong',
  strong: '$borderColorFocus',
  subtle: '$outlineSubtle',
};

const variantThickness: Record<SeparatorVariant, number> = {
  default: 1,
  strong: 2,
  subtle: 1,
};

export function Separator({
  vertical = false,
  variant = 'default',
  label,
  ...props
}: SeparatorProps): React.JSX.Element {
  const color = variantColor[variant];
  const thickness = variantThickness[variant];

  if (label && !vertical) {
    return (
      <XStack alignItems="center" gap="$3" width="100%">
        <TamaguiSeparator
          flex={1}
          borderColor={color}
          borderWidth={0}
          borderTopWidth={thickness}
          {...props}
        />
        <Text
          fontFamily="$heading"
          fontSize={11}
          letterSpacing={2}
          textTransform="uppercase"
          color="$textMuted"
        >
          {label}
        </Text>
        <TamaguiSeparator
          flex={1}
          borderColor={color}
          borderWidth={0}
          borderTopWidth={thickness}
        />
      </XStack>
    );
  }

  if (vertical) {
    return <YStack width={1} alignSelf="stretch" backgroundColor={color} />;
  }

  return (
    <TamaguiSeparator
      borderColor={color}
      borderWidth={0}
      borderTopWidth={thickness}
      width="100%"
      {...props}
    />
  );
}
