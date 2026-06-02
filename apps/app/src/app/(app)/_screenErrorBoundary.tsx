import React from 'react';
import type { ErrorBoundaryProps } from 'expo-router';
import { Button, Text, YStack } from 'tamagui';
import { LOGGER } from '@legacy-sports/logging';

/**
 * Per-route error boundary for the drawer segment.
 *
 * Exported as `ErrorBoundary` from every route file in `(app)/` so expo-router
 * wraps each screen individually. A crash in Screen A shows this fallback only
 * for Screen A; the drawer and all other screens remain functional.
 *
 * Receives expo-router's `ErrorBoundaryProps` ({ error, retry }).
 */
export function ScreenErrorBoundary({
  error,
  retry,
}: ErrorBoundaryProps): React.JSX.Element {
  React.useEffect(() => {
    LOGGER.error('Screen error boundary caught an error', error, {
      context: 'screen-error-boundary',
    });
  }, [error]);

  return (
    <YStack
      flex={1}
      justifyContent="center"
      alignItems="center"
      padding="$5"
      backgroundColor="$background"
      gap="$4"
    >
      <Text fontSize="$8" fontWeight="700" color="$red10" textAlign="center">
        Oops! Something went wrong
      </Text>
      <Text fontSize="$4" textAlign="center" color="$color10">
        This screen encountered an error. Tap below to try again.
      </Text>
      <Button
        testID="screen-error-retry"
        onPress={() => {
          void retry();
        }}
        backgroundColor="$red9"
        borderRadius="$3"
        paddingHorizontal="$5"
        pressStyle={{ backgroundColor: '$red10' }}
      >
        <Text color="$color1" fontWeight="700" fontSize="$4">
          Try Again
        </Text>
      </Button>
      {process.env.NODE_ENV !== 'production' && (
        <YStack
          backgroundColor="$background"
          padding="$4"
          borderRadius="$3"
          borderWidth={1}
          borderColor="$red7"
          maxWidth="100%"
        >
          <Text fontFamily="$mono" fontSize="$2" color="$red10">
            {error.toString()}
          </Text>
        </YStack>
      )}
    </YStack>
  );
}
