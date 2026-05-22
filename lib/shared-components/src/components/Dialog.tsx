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
  /** Optional eyebrow label rendered above the title in heritage gold (e.g. "Commissioner action"). */
  eyebrow?: string;
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

export function Dialog({
  open,
  onOpenChange,
  eyebrow,
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
          opacity={1}
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
          backgroundColor="rgba(8, 12, 20, 0.7)"
        />
        <TamaguiDialog.Content
          key="content"
          backgroundColor="$surfacePanel"
          borderRadius={20}
          borderWidth={1}
          borderColor="$surfacePanelBorder"
          padding={28}
          gap={16}
          maxWidth={480}
          shadowColor="rgba(8, 12, 20, 0.75)"
          shadowOffset={{ width: 0, height: 20 }}
          shadowRadius={48}
          animation="medium"
          enterStyle={{ opacity: 0, scale: 0.96, y: 8 }}
          exitStyle={{ opacity: 0, scale: 0.96, y: 8 }}
        >
          <XStack alignItems="flex-start" gap="$3">
            <YStack flex={1} gap="$1">
              {eyebrow ? (
                <Text
                  fontFamily="$heading"
                  fontWeight="700"
                  fontSize={11}
                  letterSpacing={1.4}
                  textTransform="uppercase"
                  color="$brandGoldLight"
                >
                  {eyebrow}
                </Text>
              ) : null}
              <TamaguiDialog.Title asChild>
                <Text
                  fontFamily="$heading"
                  fontWeight="800"
                  fontSize={24}
                  letterSpacing={-0.2}
                  color="$color12"
                >
                  {title}
                </Text>
              </TamaguiDialog.Title>
              {description ? (
                <TamaguiDialog.Description asChild>
                  <Text
                    fontFamily="$body"
                    fontSize={15}
                    lineHeight={23}
                    color="$textMuted"
                  >
                    {description}
                  </Text>
                </TamaguiDialog.Description>
              ) : null}
            </YStack>
            <TamaguiDialog.Close asChild>
              <Button
                size="$2"
                width={32}
                height={32}
                borderRadius={8}
                chromeless
                icon={<X size={16} color="$textMuted" />}
                aria-label="Close"
              />
            </TamaguiDialog.Close>
          </XStack>

          {children}

          <XStack justifyContent="flex-end" gap={10} marginTop={8}>
            <Button
              size="$3"
              borderRadius={12}
              borderWidth={1}
              borderColor="$outlineStrong"
              backgroundColor="transparent"
              onPress={onCancel}
            >
              <Text
                fontFamily="$heading"
                fontWeight="700"
                fontSize={13}
                letterSpacing={0.5}
                textTransform="uppercase"
                color="$color11"
              >
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
                fontSize={13}
                letterSpacing={0.5}
                textTransform="uppercase"
                color="#fff"
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
