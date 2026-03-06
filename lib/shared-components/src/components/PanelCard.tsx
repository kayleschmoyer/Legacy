/**
 * PanelCard — a standard styled card panel used throughout the app.
 *
 * Replaces the repeated pattern:
 *   <Card backgroundColor="$surfacePanel" borderColor="$surfacePanelBorder"
 *     borderWidth={1} borderRadius="$6" padding="$5">
 *
 * Works cross-platform with Tamagui.
 */
import React from 'react';
import { Card, styled } from 'tamagui';

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call -- Tamagui styled() returns loosely typed
export const PanelCard = styled(Card, {
  backgroundColor: '$surfacePanel',
  borderColor: '$surfacePanelBorder',
  borderWidth: 1,
  borderRadius: '$6',
  padding: '$5',
  overflow: 'hidden',

  variants: {
    interactive: {
      true: {
        animation: 'quick',
        pressStyle: { scale: 0.98 },
        hoverStyle: {
          borderColor: '$blue8',
          backgroundColor: '$backgroundHover',
        },
      },
    },
    compact: {
      true: {
        padding: '$3',
        borderRadius: '$4',
      },
    },
  } as const,
});

export type PanelCardProps = React.ComponentProps<typeof PanelCard>;
