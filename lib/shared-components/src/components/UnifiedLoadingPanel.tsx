/**
 * UnifiedLoadingPanel — the single cross-platform loading indicator.
 *
 * Consolidates the 6+ LoadingPanel implementations scattered across:
 *  - apps/web/src/components/LoadingPanel.tsx
 *  - apps/web/src/components/common/LoadingPanel.tsx
 *  - apps/app/src/common/components/LoadingPanel.tsx
 *  - lib/shared-components/src/LoadingPanel.tsx
 *  - lib/shared-components/src/LoadingPanelMigrated.tsx
 *  - lib/ui-abstractions/src/components/Utils.tsx
 *
 * Uses Tamagui's `Spinner` which works cross-platform.
 */
import React from 'react';
import { Spinner, Text, YStack } from 'tamagui';

export interface UnifiedLoadingPanelProps {
  /** Optional message shown below the spinner. */
  message?: string;
  /** Spinner size. Defaults to "large". */
  size?: 'small' | 'large';
  /** If false, renders nothing. Defaults to true. */
  loading?: boolean;
  /** Whether the panel should fill the full viewport height. Defaults to false. */
  fullScreen?: boolean;
}

export function UnifiedLoadingPanel({
  message,
  size = 'large',
  loading = true,
  fullScreen = false,
}: UnifiedLoadingPanelProps): React.JSX.Element | null {
  if (!loading) {
    return null;
  }

  return (
    <YStack
      flex={fullScreen ? 1 : undefined}
      alignItems="center"
      justifyContent="center"
      padding="$6"
      gap="$3"
      minHeight={fullScreen ? '100vh' : undefined}
      backgroundColor={fullScreen ? '$background' : undefined}
    >
      <Spinner size={size} color="$blue9" />
      {message ? (
        <Text fontSize="$3" color="$gray10">
          {message}
        </Text>
      ) : null}
    </YStack>
  );
}
