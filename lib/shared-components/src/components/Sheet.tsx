import React from 'react';
import { Button, Sheet as TamaguiSheet, Text, XStack, YStack } from 'tamagui';
import { X } from '@tamagui/lucide-icons';

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  /** Snap-points as percentages of viewport. Defaults to [50, 90]. */
  snapPoints?: number[];
  children?: React.ReactNode;
}

/**
 * Bottom sheet — used for mobile filter pickers and contextual actions.
 * Drag handle, optional title row, full-bleed body. Snap points default
 * to half-height + near-full-screen.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  snapPoints = [50, 90],
  children,
}: SheetProps): React.JSX.Element {
  return (
    <TamaguiSheet
      modal
      open={open}
      onOpenChange={onOpenChange}
      snapPointsMode="percent"
      snapPoints={snapPoints}
      dismissOnSnapToBottom
      animation="medium"
    >
      <TamaguiSheet.Overlay
        animation="medium"
        backgroundColor="#000"
        opacity={0.55}
        enterStyle={{ opacity: 0 }}
        exitStyle={{ opacity: 0 }}
      />
      <TamaguiSheet.Frame
        backgroundColor="$surfaceCard"
        borderTopLeftRadius={20}
        borderTopRightRadius={20}
        padding="$4"
        gap="$3"
      >
        <TamaguiSheet.Handle backgroundColor="$outlineStrong" />
        {title ? (
          <XStack alignItems="center" justifyContent="space-between">
            <Text
              fontFamily="$heading"
              fontWeight="800"
              fontSize={20}
              letterSpacing={-0.2}
              color="$color12"
            >
              {title}
            </Text>
            <Button
              size="$2"
              circular
              chromeless
              onPress={() => onOpenChange(false)}
              icon={<X size={16} color="$textMuted" />}
              aria-label="Close"
            />
          </XStack>
        ) : null}
        <YStack flex={1} gap="$3">
          {children}
        </YStack>
      </TamaguiSheet.Frame>
    </TamaguiSheet>
  );
}
