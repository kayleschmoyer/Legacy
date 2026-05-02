import React from 'react';
import { Separator as TamaguiSeparator, Text, XStack, YStack } from 'tamagui';
import type { GetProps } from 'tamagui';

export interface SeparatorProps extends Omit<
  GetProps<typeof TamaguiSeparator>,
  'children'
> {
  /** Orientation. Defaults to horizontal. */
  vertical?: boolean;
  /** Optional centered label (horizontal only). Renders an "OR" rule. */
  label?: string;
}

/**
 * Hairline divider. 1px solid `--glass-border` on dark, optionally with
 * a centered label that breaks the rule (e.g. "OR").
 */
export function Separator({
  vertical = false,
  label,
  ...props
}: SeparatorProps): React.JSX.Element {
  if (label && !vertical) {
    return (
      <XStack alignItems="center" gap="$3" width="100%">
        <TamaguiSeparator
          flex={1}
          borderColor="$glassBorder"
          borderWidth={0}
          borderTopWidth={1}
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
          borderColor="$glassBorder"
          borderWidth={0}
          borderTopWidth={1}
        />
      </XStack>
    );
  }

  if (vertical) {
    return (
      <YStack width={1} alignSelf="stretch" backgroundColor="$glassBorder" />
    );
  }

  return (
    <TamaguiSeparator
      borderColor="$glassBorder"
      borderWidth={0}
      borderTopWidth={1}
      width="100%"
      {...props}
    />
  );
}
