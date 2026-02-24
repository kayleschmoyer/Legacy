/**
 * EmptyState — a centered placeholder shown when a list or section has no data.
 *
 * Replaces the duplicated "No X yet" patterns across web and mobile.
 */
import React from 'react';
import { Text, YStack } from 'tamagui';

export interface EmptyStateProps {
  /** Optional icon element rendered above the title. */
  icon?: React.ReactNode;
  /** The heading text (e.g. "No standings yet"). */
  title: string;
  /** Optional description paragraph below the title. */
  description?: string;
  /** Optional action element (e.g. a Button) rendered below the description. */
  action?: React.ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps): React.JSX.Element {
  return (
    <YStack alignItems="center" justifyContent="center" padding="$6" gap="$3">
      {icon ? (
        <YStack
          width={56}
          height={56}
          borderRadius="$6"
          backgroundColor="$gray3"
          alignItems="center"
          justifyContent="center"
        >
          {icon}
        </YStack>
      ) : null}

      <Text fontSize="$5" fontWeight="600" color="$color12" textAlign="center">
        {title}
      </Text>

      {description ? (
        <Text fontSize="$3" color="$gray9" textAlign="center" maxWidth={320}>
          {description}
        </Text>
      ) : null}

      {action ?? null}
    </YStack>
  );
}
