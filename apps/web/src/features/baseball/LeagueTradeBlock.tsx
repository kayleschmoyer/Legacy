import React, { useMemo, useState } from 'react';
import { Card, Separator, Text, XStack, YStack } from 'tamagui';
import { Button } from '@legacy-sports/shared-components';
import { ArrowLeftRight, ChevronDown, ChevronUp } from '@tamagui/lucide-icons';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  withAlpha,
} from '../../constants/colors';

interface TeamMember {
  id?: number | null;
  playerId?: number | null;
  playerName?: string | null;
  positionId?: number | null;
  teamId?: number | null;
}

export interface LeagueTradeBlockProps {
  leagueId: number;
  teamMembers: readonly TeamMember[];
}

/**
 * LeagueTradeBlock — A sidebar widget showing players available for trade.
 *
 * In a full implementation this would connect to a trade-block API where
 * managers list players they're willing to move. For now it shows bench
 * players as potential trade candidates since those are the most likely
 * pieces managers would deal.
 */
export function LeagueTradeBlock({
  leagueId,
  teamMembers,
}: LeagueTradeBlockProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);

  // Bench players = no positionId assigned (most likely trade candidates)
  const benchPlayers = useMemo(
    () => teamMembers.filter((m) => !m.positionId && m.playerName),
    [teamMembers],
  );

  const displayList = expanded ? benchPlayers : benchPlayers.slice(0, 4);
  const hasMore = benchPlayers.length > 4;

  if (benchPlayers.length === 0) {
    return (
      <Card
        backgroundColor="$surfacePanel"
        borderColor="$surfacePanelBorder"
        borderWidth={1}
        borderRadius="$6"
        padding="$5"
      >
        <XStack alignItems="center" gap="$2" marginBottom="$3">
          <ArrowLeftRight size={18} color="var(--color)" />
          <Text fontSize="$5" fontWeight="700" color="$color">
            Trade Block
          </Text>
        </XStack>
        <YStack alignItems="center" gap="$2" paddingVertical="$4">
          <Text color="$textMuted" fontSize="$3" textAlign="center">
            No bench players available for trade.
          </Text>
          <Text color="$textMuted" fontSize="$2" textAlign="center">
            Add players to your bench to start shopping them around.
          </Text>
        </YStack>
      </Card>
    );
  }

  return (
    <Card
      backgroundColor="$surfacePanel"
      borderColor="$surfacePanelBorder"
      borderWidth={1}
      borderRadius="$6"
      padding="$5"
    >
      <XStack
        alignItems="center"
        justifyContent="space-between"
        marginBottom="$3"
      >
        <XStack alignItems="center" gap="$2">
          <ArrowLeftRight size={18} color="var(--color)" />
          <Text fontSize="$5" fontWeight="700" color="$color">
            Trade Block
          </Text>
        </XStack>
        <XStack
          backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.18)}
          borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.5)}
          borderWidth={1}
          borderRadius="$10"
          paddingHorizontal="$2"
          paddingVertical="$1"
        >
          <Text fontSize="$1" fontWeight="700" color={BRAND_GOLD_LIGHT}>
            {benchPlayers.length} available
          </Text>
        </XStack>
      </XStack>

      <Text fontSize="$2" color="$textMuted" marginBottom="$3">
        Bench players you could offer in a trade:
      </Text>

      <YStack gap="$1">
        {displayList.map((player, idx) => (
          <React.Fragment key={player.id ?? idx}>
            <XStack
              justifyContent="space-between"
              alignItems="center"
              paddingVertical="$2"
              paddingHorizontal="$2"
              borderRadius="$3"
              hoverStyle={{ backgroundColor: '$surfaceSubtle' }}
            >
              <XStack alignItems="center" gap="$2" flex={1}>
                <YStack
                  width={28}
                  height={28}
                  borderRadius={14}
                  backgroundColor="$surfaceSubtle"
                  alignItems="center"
                  justifyContent="center"
                >
                  <Text fontSize="$2" fontWeight="700" color="$textMuted">
                    {(player.playerName ?? '?')[0]}
                  </Text>
                </YStack>
                <Text fontSize="$3" color="$color" fontWeight="500">
                  {player.playerName ?? 'Unknown Player'}
                </Text>
              </XStack>
              <XStack
                backgroundColor="$amber3"
                borderRadius="$2"
                paddingHorizontal="$2"
                paddingVertical="$0.5"
              >
                <Text fontSize="$1" fontWeight="600" color="$amber11">
                  BENCH
                </Text>
              </XStack>
            </XStack>
            {idx < displayList.length - 1 && (
              <Separator borderColor="$outlineSubtle" />
            )}
          </React.Fragment>
        ))}
      </YStack>

      {hasMore && (
        <Button
          size="$3"
          backgroundColor="transparent"
          borderWidth={0}
          onPress={() => setExpanded(!expanded)}
          marginTop="$2"
          alignSelf="center"
          icon={
            expanded ? (
              <ChevronUp size={14} color={BRAND_GOLD_LIGHT} />
            ) : (
              <ChevronDown size={14} color={BRAND_GOLD_LIGHT} />
            )
          }
        >
          <Text fontSize="$2" fontWeight="600" color={BRAND_GOLD_LIGHT}>
            {expanded ? 'Show fewer' : `Show ${benchPlayers.length - 4} more`}
          </Text>
        </Button>
      )}
    </Card>
  );
}
