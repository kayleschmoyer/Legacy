import React from 'react';
import { Button, Dialog as TamaguiDialog, Text, XStack, YStack } from 'tamagui';
import type { GetProps } from 'tamagui';
import { X } from '@tamagui/lucide-icons';

export interface DialogProps extends Omit<
  GetProps<typeof TamaguiDialog>,
  'children'
> {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  /** Primary action label. */
  confirmLabel?: string;
  /** Secondary action label. */
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  /** When true, paint the confirm button in seam-red (delete leagues, etc.). */
  destructive?: boolean;
}

/**
 * Modal dialog over a navy scrim. Header / body / action row layout.
 * Set `destructive` to render the primary action in seam-red.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  destructive = false,
}: DialogProps): React.JSX.Element {
  return (
    <TamaguiDialog modal open={open} onOpenChange={onOpenChange}>
      <TamaguiDialog.Portal>
        <TamaguiDialog.Overlay
          key="overlay"
          animation="quick"
          opacity={0.6}
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
          backgroundColor="#000"
        />
        <TamaguiDialog.Content
          key="content"
          backgroundColor="$surfaceCard"
          borderRadius={20}
          borderWidth={1}
          borderColor="$glassBorder"
          padding="$5"
          gap="$4"
          width={440}
          maxWidth="90vw"
          shadowColor="rgba(8, 12, 20, 0.65)"
          shadowOffset={{ width: 0, height: 12 }}
          shadowRadius={32}
          animation="medium"
          enterStyle={{ opacity: 0, scale: 0.96, y: 8 }}
          exitStyle={{ opacity: 0, scale: 0.96, y: 8 }}
        >
          <XStack alignItems="flex-start" gap="$3">
            <YStack flex={1} gap="$1">
              <TamaguiDialog.Title asChild>
                <Text
                  fontFamily="$heading"
                  fontWeight="800"
                  fontSize={22}
                  letterSpacing={-0.2}
                  color="$color12"
                >
                  {title}
                </Text>
              </TamaguiDialog.Title>
              {description ? (
                <TamaguiDialog.Description asChild>
                  <Text fontFamily="$body" fontSize={14} color="$textMuted">
                    {description}
                  </Text>
                </TamaguiDialog.Description>
              ) : null}
            </YStack>
            <TamaguiDialog.Close asChild>
              <Button
                size="$2"
                circular
                chromeless
                icon={<X size={16} color="$textMuted" />}
                aria-label="Close"
              />
            </TamaguiDialog.Close>
          </XStack>

          {children}

          <XStack justifyContent="flex-end" gap="$2">
            <Button chromeless size="$3" onPress={onCancel} borderRadius={12}>
              <Text fontFamily="$body" fontWeight="600" color="$textMuted">
                {cancelLabel}
              </Text>
            </Button>
            <Button
              size="$3"
              borderRadius={12}
              backgroundColor={destructive ? '$brandSeamRed' : '$brandNavy'}
              borderColor={
                destructive ? '$brandSeamRedLight' : '$brandNavyLight'
              }
              borderWidth={1}
              hoverStyle={{
                backgroundColor: destructive
                  ? '$brandSeamRedLight'
                  : '$brandNavyLight',
              }}
              pressStyle={{ scale: 0.98 }}
              onPress={onConfirm}
            >
              <Text
                fontFamily="$heading"
                fontWeight="700"
                color="#fff"
                letterSpacing={0.4}
              >
                {confirmLabel}
              </Text>
            </Button>
          </XStack>
        </TamaguiDialog.Content>
      </TamaguiDialog.Portal>
    </TamaguiDialog>
  );
}
