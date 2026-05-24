import React from 'react';
import { XStack as TamaguiXStack, YStack as TamaguiYStack } from 'tamagui';
import { tamaguiStyled } from '../utils/tamaguiStyled';

/** Horizontal layout primitive — default gap $3 (12 px), alignItems center per design spec. */
export const XStack = tamaguiStyled(TamaguiXStack, {
  gap: '$3',
  alignItems: 'center',
}) as React.ComponentType<React.ComponentProps<typeof TamaguiXStack>>;

/** Vertical layout primitive — default gap $2 (8 px) per design spec. */
export const YStack = tamaguiStyled(TamaguiYStack, {
  gap: '$2',
}) as React.ComponentType<React.ComponentProps<typeof TamaguiYStack>>;

export type XStackProps = React.ComponentProps<typeof TamaguiXStack>;
export type YStackProps = React.ComponentProps<typeof TamaguiYStack>;
