import React from 'react';
import { Button, Dialog, H3, Text, XStack, YStack } from 'tamagui';
import { X } from '@tamagui/lucide-icons';
import {
  BRAND_NAVY,
  BRAND_NAVY_DARK,
  BRAND_NAVY_LIGHT,
  SURFACE_CARD,
  WHITE,
  withAlpha,
} from '../constants/colors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BaseModalProps {
  /** Whether the modal is visible */
  open: boolean;
  /** Callback when the modal should close */
  onOpenChange: (open: boolean) => void;
  /** Primary title displayed in the gradient header */
  title: string;
  /** Accessible ID for the title element (used by aria-labelledby) */
  titleId?: string;
  /** Optional subtitle text below the title */
  subtitle?: string;
  /** Optional badge / extra content rendered inline next to the title */
  titleBadge?: React.ReactNode;
  /** Optional max width override (default: 960) */
  maxWidth?: number;
  /** Optional max height override (default: 88vh) */
  maxHeight?: string;
  /** Modal body content */
  children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * BaseModal — Shared modal wrapper with the Legacy Sports brand treatment.
 *
 * Features:
 *  - Navy gradient glass header with title, optional badge, and close button
 *  - Consistent overlay + entrance/exit animations
 *  - ARIA attributes for accessibility
 *  - Scrollable body area
 *
 * Usage:
 * ```tsx
 * <BaseModal open={isOpen} onOpenChange={setIsOpen} title="Player Stats">
 *   <YStack padding="$4">{…}</YStack>
 * </BaseModal>
 * ```
 */
export function BaseModal({
  open,
  onOpenChange,
  title,
  titleId = 'base-modal-title',
  subtitle,
  titleBadge,
  maxWidth = 960,
  maxHeight = '88vh',
  children,
}: BaseModalProps) {
  return (
    <Dialog modal open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* ── Backdrop overlay ── */}
        <Dialog.Overlay
          key="base-modal-overlay"
          animation="quick"
          opacity={0.5}
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
        />

        {/* ── Content shell ── */}
        <Dialog.Content
          bordered
          elevate
          key="base-modal-content"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          animateOnly={['transform', 'opacity']}
          animation={['quick', { opacity: { overshootClamping: true } }]}
          enterStyle={{ x: 0, y: -20, opacity: 0, scale: 0.9 }}
          exitStyle={{ x: 0, y: 10, opacity: 0, scale: 0.95 }}
          width="92%"
          maxWidth={maxWidth}
          maxHeight={maxHeight}
          backgroundColor={SURFACE_CARD}
          borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.35)}
          borderRadius="$5"
          overflow="hidden"
          padding={0}
        >
          {/* ── Glass gradient header ── */}
          <XStack
            paddingHorizontal="$5"
            paddingVertical="$4"
            justifyContent="space-between"
            alignItems="center"
            style={{
              background: `linear-gradient(135deg, ${BRAND_NAVY} 0%, ${BRAND_NAVY_DARK} 100%)`,
            }}
          >
            <YStack gap="$1" flex={1} marginRight="$3">
              <XStack gap="$2" alignItems="center" flexWrap="wrap">
                <H3
                  id={titleId}
                  color={WHITE}
                  fontSize="$7"
                  fontWeight="bold"
                  margin={0}
                >
                  {title}
                </H3>
                {titleBadge}
              </XStack>
              {subtitle && (
                <Text fontSize="$2" color={withAlpha(WHITE, 0.75)}>
                  {subtitle}
                </Text>
              )}
            </YStack>

            <Dialog.Close asChild>
              <Button
                size="$3"
                circular
                icon={X}
                aria-label="Close"
                backgroundColor={withAlpha(WHITE, 0.15)}
                color={WHITE}
                hoverStyle={{ backgroundColor: withAlpha(WHITE, 0.25) }}
                pressStyle={{ backgroundColor: withAlpha(WHITE, 0.3) }}
              />
            </Dialog.Close>
          </XStack>

          {/* ── Scrollable body ── */}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
