import React from 'react';
import { YStack } from 'tamagui';
import {
  TiebreakerConfig as SharedTiebreakerConfig,
  TiebreakerHistory,
} from '@legacy-sports/shared-components';

export interface TiebreakerConfigPageProps {
  leagueId: number;
  isCommissioner?: boolean;
  onSuccess?: (message: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Web entry point for tiebreaker configuration.
 * Composes the shared TiebreakerConfig and TiebreakerHistory components.
 */
export function TiebreakerConfig({
  leagueId,
  isCommissioner,
  onSuccess,
  onError,
}: TiebreakerConfigPageProps) {
  return (
    <YStack gap="$4">
      <SharedTiebreakerConfig
        leagueId={leagueId}
        isCommissioner={isCommissioner}
        onSuccess={onSuccess}
        onError={onError}
      />
      <TiebreakerHistory leagueId={leagueId} />
    </YStack>
  );
}
