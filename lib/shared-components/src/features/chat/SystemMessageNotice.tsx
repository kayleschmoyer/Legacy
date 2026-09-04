import React from 'react';
import { Text, YStack } from 'tamagui';

export interface SystemMessageNoticeProps {
  /** Human-readable summary of the system event, e.g. "Scores were recomputed for 6 matchups". */
  messageText: string;
  createdAt: string;
  formatTime: (isoString: string) => string;
  testID?: string;
}

/**
 * Generic system-chat notice: a centered, italic, gray pill with no avatar or
 * username — visually distinct from a user-authored message bubble. Used for
 * any `messageType` that carries no dedicated card (LS-9666's
 * `system_scoring_changed` / `system_scores_recomputed`, plus the existing
 * generic `'system'` type). Shared so web and mobile render authorless
 * system messages identically (`.agents/skills/shared-components-first`).
 */
export function SystemMessageNotice({
  messageText,
  createdAt,
  formatTime,
  testID = 'system-message',
}: SystemMessageNoticeProps): React.JSX.Element {
  return (
    <YStack
      testID={testID}
      alignItems="center"
      marginBottom="$2"
      paddingHorizontal="$3"
    >
      <YStack
        backgroundColor="$gray3"
        borderRadius="$10"
        paddingHorizontal="$3"
        paddingVertical="$1"
        maxWidth="90%"
      >
        <Text
          color="$gray10"
          fontSize="$2"
          textAlign="center"
          fontStyle="italic"
        >
          {messageText}
        </Text>
      </YStack>
      <Text fontSize="$1" color="$gray9" marginTop="$1">
        {formatTime(createdAt)}
      </Text>
    </YStack>
  );
}
