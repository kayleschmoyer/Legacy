import React from 'react';
import { Popover as TamaguiPopover, YStack } from 'tamagui';
import type { GetProps } from 'tamagui';

export interface PopoverProps extends Omit<
  GetProps<typeof TamaguiPopover>,
  'children'
> {
  /** The element that opens the popover (e.g. a button). */
  trigger: React.ReactNode;
  /** Body content. */
  children?: React.ReactNode;
  /** Show pointer arrow. Defaults to true. */
  arrow?: boolean;
}

/**
 * Anchored popover. Used by DateTimePicker (calendar), menus, and info
 * popouts. Renders inside a brand-styled card.
 */
export function Popover({
  trigger,
  children,
  arrow = true,
  ...props
}: PopoverProps): React.JSX.Element {
  return (
    <TamaguiPopover size="$4" allowFlip {...props}>
      <TamaguiPopover.Trigger asChild>{trigger}</TamaguiPopover.Trigger>
      <TamaguiPopover.Content
        borderWidth={1}
        borderColor="$outlineStrong"
        backgroundColor="$surfaceCard"
        borderRadius={8}
        padding={14}
        minWidth={300}
        elevate
        animation="quick"
        enterStyle={{ y: -4, opacity: 0 }}
        exitStyle={{ y: -4, opacity: 0 }}
        shadowColor="rgba(8, 12, 20, 0.65)"
        shadowOffset={{ width: 0, height: 12 }}
        shadowRadius={32}
      >
        {arrow ? (
          <TamaguiPopover.Arrow borderWidth={1} borderColor="$outlineStrong" />
        ) : null}
        <YStack gap={10}>{children}</YStack>
      </TamaguiPopover.Content>
    </TamaguiPopover>
  );
}
