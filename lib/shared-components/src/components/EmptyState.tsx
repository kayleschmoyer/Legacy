/**
 * EmptyState — a centered placeholder shown when a list or section has no data.
 *
 * Replaces the duplicated "No X yet" patterns across web and mobile.
 * Supports a `variant="error"` for failed-load states and a `compact` prop
 * for tighter contexts (e.g. activity feed sidebars).
 */
import React from 'react';
import { Text, YStack } from 'tamagui';
import { FONT_BODY, FONT_DISPLAY } from '../utils/typography';

export type EmptyStateVariant = 'default' | 'error';

export interface EmptyStateProps {
  /** Optional icon element rendered above the title. */
  icon?: React.ReactNode;
  /** The heading text (e.g. "No standings yet"). */
  title: string;
  /** Optional description paragraph below the title. */
  description?: string;
  /** Optional action element (e.g. a Button) rendered below the description. */
  action?: React.ReactNode;
  /**
   * Visual variant.
   * - `default` — neutral icon container on surface-card background
   * - `error` — danger-tinted icon container; use for failed-load states
   */
  variant?: EmptyStateVariant;
  /** Compact mode: reduced padding (20px), smaller type, 160px min-height. */
  compact?: boolean;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  variant = 'default',
  compact = false,
}: EmptyStateProps): React.JSX.Element {
  const isError = variant === 'error';

  return (
    <YStack
      backgroundColor="$surfacePanel"
      borderWidth={1}
      borderColor="$surfacePanelBorder"
      borderRadius={16}
      paddingVertical={compact ? 20 : 32}
      paddingHorizontal={compact ? 20 : 24}
      alignItems="center"
      justifyContent="center"
      gap={12}
      minHeight={compact ? 160 : 240}
    >
      {icon ? (
        <YStack
          width={56}
          height={56}
          borderRadius={9999}
          backgroundColor={isError ? '$red2' : '$surfaceCard'}
          borderWidth={1}
          borderColor={isError ? '$red6' : '$outlineStrong'}
          alignItems="center"
          justifyContent="center"
        >
          {icon}
        </YStack>
      ) : null}

      <Text
        fontFamily={FONT_DISPLAY}
        fontWeight="700"
        fontSize={compact ? 15 : 18}
        color="$color12"
        textAlign="center"
        letterSpacing={-0.1}
      >
        {title}
      </Text>

      {description ? (
        <Text
          fontFamily={FONT_BODY}
          fontSize={compact ? 13 : 14}
          color="$textMuted"
          textAlign="center"
          maxWidth={280}
          lineHeight={compact ? 20 : 21}
        >
          {description}
        </Text>
      ) : null}

      {action ?? null}
    </YStack>
  );
}
