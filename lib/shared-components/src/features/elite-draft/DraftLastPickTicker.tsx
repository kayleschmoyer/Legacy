import React from 'react';
import { Text, XStack } from 'tamagui';
import { formatLastPickLine } from './nativeDraftBoard';
import type { DraftPickRecord, DraftPlayer } from './types';

export interface DraftLastPickTickerProps {
  /** Most recent pick made, or `null` before the draft's first pick. */
  lastPick: DraftPickRecord | null;
  statsLookup: Map<number, DraftPlayer>;
  teamName: string;
}

/**
 * Persistent "LAST" row under the header band (Draft Room v2 shell,
 * LS-9397) — README "Last-pick ticker (persistent)".
 */
export function DraftLastPickTicker({
  lastPick,
  statsLookup,
  teamName,
}: DraftLastPickTickerProps): React.JSX.Element | null {
  if (!lastPick) return null;

  return (
    <XStack
      testID="draft-last-pick-ticker"
      alignItems="center"
      gap={6}
      backgroundColor="$surfaceSubtle"
      borderBottomWidth={1}
      borderBottomColor="$outlineSubtle"
      paddingVertical={6}
      paddingHorizontal={14}
    >
      <Text
        fontSize={9.5}
        fontWeight="700"
        color="$fg4"
        flexShrink={0}
        letterSpacing={0.5}
      >
        LAST
      </Text>
      <Text fontSize={11} color="$fg3" numberOfLines={1} flex={1}>
        {formatLastPickLine(lastPick, statsLookup, teamName)}
      </Text>
    </XStack>
  );
}
