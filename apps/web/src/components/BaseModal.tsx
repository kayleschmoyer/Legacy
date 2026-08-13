import React, { useEffect, useRef } from 'react';
import { Button, Dialog, H3, Text, XStack, YStack } from 'tamagui';
import { X } from '@tamagui/lucide-icons/icons/X';
import { useReducedMotion } from '@legacy-sports/shared-components/utils';
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
  /**
   * Optional accent color for the header. When provided, the header is rendered
   * as a position/category-tinted radial wash over the navy gradient instead of
   * the plain navy gradient.
   */
  headerAccentColor?: string;
  /** Optional max width override (default: 960) */
  maxWidth?: number;
  /** Optional max height override (default: min(88dvh, calc(100dvh - 32px))) */
  maxHeight?: string;
  /**
   * When true, suppress the default gradient header. The consumer is then
   * responsible for rendering its own masthead inside `children` (including a
   * close affordance that calls `onOpenChange(false)`). `title` is still used
   * as the accessible label via `aria-label` on the dialog content.
   */
  hideHeader?: boolean;
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
  headerAccentColor,
  maxWidth = 960,
  maxHeight = 'min(88dvh, calc(100dvh - 32px))',
  hideHeader = false,
  children,
}: BaseModalProps) {
  // Capture whatever had focus right before the dialog opened so it can be
  // restored on close. Tamagui's own Dialog only restores focus to a
  // `Dialog.Trigger` element (Dialog.tsx `context.triggerRef`), but none of
  // this app's BaseModal consumers render a `Dialog.Trigger` — they toggle
  // `open` from external state — so that fallback is always a no-op here.
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      previouslyFocusedElementRef.current =
        document.activeElement as HTMLElement | null;
    }
  }, [open]);

  // Springs settle at browser-dependent real-world durations; collapse to a
  // near-instant timing animation under prefers-reduced-motion so the dialog
  // enter/exit is deterministic for users who request it (and for E2E, which
  // forces this media feature — LS-8995).
  const dialogAnimation = useReducedMotion() ? '100ms' : 'quick';

  const headerBackground = headerAccentColor
    ? `radial-gradient(ellipse at 100% 0%, ${withAlpha(headerAccentColor, 0.32)} 0%, transparent 60%), radial-gradient(ellipse at 0% 100%, ${withAlpha(headerAccentColor, 0.18)} 0%, transparent 55%), linear-gradient(135deg, ${BRAND_NAVY} 0%, ${BRAND_NAVY_DARK} 100%)`
    : `linear-gradient(135deg, ${BRAND_NAVY} 0%, ${BRAND_NAVY_DARK} 100%)`;
  return (
    <Dialog modal open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* ── Backdrop overlay ── */}
        <Dialog.Overlay
          key="base-modal-overlay"
          animation={dialogAnimation}
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
          {...(hideHeader
            ? { 'aria-label': title }
            : { 'aria-labelledby': titleId })}
          animateOnly={['transform', 'opacity']}
          animation={[
            dialogAnimation,
            { opacity: { overshootClamping: true } },
          ]}
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
          onCloseAutoFocus={(event: Event) => {
            event.preventDefault();
            previouslyFocusedElementRef.current?.focus();
          }}
        >
          {/* ── Glass gradient header (suppressed when `hideHeader`) ── */}
          {!hideHeader && (
            <XStack
              paddingHorizontal="$5"
              paddingVertical="$4"
              justifyContent="space-between"
              alignItems="center"
              style={{
                background: headerBackground,
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
          )}

          {/* ── Scrollable body ── */}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
