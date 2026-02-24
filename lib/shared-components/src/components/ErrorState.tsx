/**
 * ErrorState — a styled error card with optional retry action.
 *
 * Replaces the duplicated error-display patterns across web and mobile.
 */
import React from 'react';
import { Button, Text, YStack } from 'tamagui';

export interface ErrorStateProps {
  /** The error object or message string. */
  error: Error | string | null | undefined;
  /** Callback for the "Retry" button. Omit to hide the button. */
  onRetry?: () => void;
  /** Custom retry button label. Defaults to "Retry". */
  retryLabel?: string;
}

export function ErrorState({
  error,
  onRetry,
  retryLabel = 'Retry',
}: ErrorStateProps): React.JSX.Element {
  const message =
    typeof error === 'string'
      ? error
      : (error?.message ?? 'An unexpected error occurred');

  return (
    <YStack
      backgroundColor="$red2"
      borderColor="$red6"
      borderWidth={1}
      borderRadius="$4"
      padding="$4"
      gap="$3"
      role="alert"
    >
      <Text fontSize="$3" color="$red11" fontWeight="600">
        {message}
      </Text>

      {onRetry ? (
        <Button
          size="$3"
          backgroundColor="$red3"
          borderColor="$red7"
          borderWidth={1}
          borderRadius="$3"
          onPress={onRetry}
          alignSelf="flex-start"
          pressStyle={{ scale: 0.97, backgroundColor: '$red4' }}
        >
          <Text color="$red11" fontWeight="600" fontSize="$2">
            {retryLabel}
          </Text>
        </Button>
      ) : null}
    </YStack>
  );
}
