import React from 'react';
import { Card as TamaguiCard } from 'tamagui';
import { tamaguiStyled } from '../utils/tamaguiStyled';

type CardVariants = {
  interactive?: boolean;
  premium?: boolean;
  compact?: boolean;
};

// Web-only CSS strings — Tamagui emits every theme token as `var(--token)`,
// so these stay theme-aware without embedding hex/rgba literals. Native
// ignores the unknown `style` keys these values feed (see usage below).
const GOLD_GRADIENT =
  'linear-gradient(135deg, var(--background) 0%, var(--accentMuted) 100%)';
const SHADOW_MD = '0 4px 14px var(--shadowColor)';
const SHADOW_LG = '0 12px 32px var(--shadowColorHover)';
const SHADOW_GOLD =
  '0 0 0 1px color-mix(in srgb, var(--brandGold) 35%, transparent), 0 6px 24px color-mix(in srgb, var(--brandGold) 25%, transparent)';

export const Card = tamaguiStyled(TamaguiCard, {
  backgroundColor: '$surfaceCard',
  borderColor: '$glassBorder',
  borderWidth: 1,
  borderRadius: '$6',
  padding: '$5',
  gap: '$2',
  overflow: 'hidden',
  // Web-only box-shadow; native ignores the unknown `style` keys gracefully.
  style: { boxShadow: SHADOW_MD },

  variants: {
    interactive: {
      true: {
        animation: 'quick',
        cursor: 'pointer',
        // Make the card a keyboard-reachable button on web. Consumers must
        // wire `onPress` to receive activation; Tamagui forwards onPress to
        // both click and keyboard (Enter/Space) via Pressable on native and
        // via a synthesized handler on web.
        role: 'button',
        tabIndex: 0,
        pressStyle: { scale: 0.99 },
        hoverStyle: {
          borderColor: '$glassBorderHover',
          y: -2,
          style: { boxShadow: SHADOW_LG },
        },
        focusStyle: {
          borderColor: '$glassBorderHover',
          style: { boxShadow: SHADOW_LG },
        },
      },
    },
    premium: {
      true: {
        // `borderColor` is a real Tamagui prop (applies on native too), so
        // it needs an actual token — not a CSS var string.
        borderColor: '$brandGold',
        style: { boxShadow: SHADOW_GOLD, backgroundImage: GOLD_GRADIENT },
      },
    },
    compact: {
      true: {
        padding: '$4',
        borderRadius: '$5',
      },
    },
  } as const,
}) as React.ComponentType<
  React.ComponentProps<typeof TamaguiCard> & CardVariants
>;

export type CardProps = React.ComponentProps<typeof TamaguiCard> & CardVariants;
