import React, { useState } from 'react';
import { Card, Separator, Spinner, Text, XStack, YStack } from 'tamagui';
import { Button } from '@legacy-sports/shared-components';
import { ArrowLeftRight, ChevronDown, ChevronUp } from '@tamagui/lucide-icons';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  withAlpha,
} from '../../constants/colors';
import {
  useGetLeagueTradeBlockQuery,
  useSetTradeBlockMutation,
} from '../../api/db/graphql.generated';

export interface LeagueTradeBlockProps {
  leagueId: number;
  /** The current user's team ID -- used to determine which toggle buttons to show. */
  userTeamId: number | null | undefined;
}

/**
 * LeagueTradeBlock -- Displays all players listed on the trade block across
 * every team in the league. GMs and assistant managers can toggle their own
 * players on/off the trade block directly from this widget.
 */
export function LeagueTradeBlock({
  leagueId,
  userTeamId,
}: LeagueTradeBlockProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);

  const { data, loading, error } = useGetLeagueTradeBlockQuery({
    variables: { leagueId },
    skip: !leagueId,
  });

  const [setTradeBlock, { loading: mutating }] = useSetTradeBlockMutation({
    refetchQueries: ['GetLeagueTradeBlock'],
  });

  const players = data?.leagueTradeBlock ?? [];
  const displayList = expanded ? players : players.slice(0, 5);
  const hasMore = players.length > 5;

  const header = (
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
      {players.length > 0 && (
        <XStack
          backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.18)}
          borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.5)}
          borderWidth={1}
          borderRadius="$10"
          paddingHorizontal="$2"
          paddingVertical="$1"
        >
          <Text fontSize="$1" fontWeight="700" color={BRAND_GOLD_LIGHT}>
            {players.length} available
          </Text>
        </XStack>
      )}
    </XStack>
  );

  if (loading) {
    return (
      <Card
        backgroundColor="$surfacePanel"
        borderColor="$surfacePanelBorder"
        borderWidth={1}
        borderRadius="$6"
        padding="$5"
      >
        {header}
        <YStack alignItems="center" paddingVertical="$4">
          <Spinner size="small" color={BRAND_GOLD_LIGHT} />
        </YStack>
      </Card>
    );
  }

  if (error) {
    return (
      <Card
        backgroundColor="$surfacePanel"
        borderColor="$surfacePanelBorder"
        borderWidth={1}
        borderRadius="$6"
        padding="$5"
      >
        {header}
        <Text
          color="$red10"
          fontSize="$3"
          textAlign="center"
          paddingVertical="$3"
        >
          Failed to load trade block.
        </Text>
      </Card>
    );
  }

  if (players.length === 0) {
    return (
      <Card
        backgroundColor="$surfacePanel"
        borderColor="$surfacePanelBorder"
        borderWidth={1}
        borderRadius="$6"
        padding="$5"
      >
        {header}
        <YStack alignItems="center" gap="$2" paddingVertical="$4">
          <Text color="$textMuted" fontSize="$3" textAlign="center">
            No players on the trade block.
          </Text>
          <Text color="$textMuted" fontSize="$2" textAlign="center">
            Use the roster page to list players for trade.
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
      {header}

      <YStack gap="$1">
        {displayList.map((member, idx) => {
          const isOwnTeam = userTeamId != null && member.teamId === userTeamId;
          const playerName = member.player
            ? `${member.player.firstName ?? ''} ${member.player.lastName ?? ''}`.trim()
            : `Player #${member.playerId}`;
          const initial = playerName[0] ?? '?';

          return (
            <React.Fragment key={member.id ?? idx}>
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
                      {initial}
                    </Text>
                  </YStack>
                  <YStack flex={1}>
                    <Text
                      fontSize="$3"
                      color="$color"
                      fontWeight="500"
                      numberOfLines={1}
                    >
                      {playerName}
                    </Text>
                  </YStack>
                </XStack>

                {isOwnTeam ? (
                  <Button
                    size="$2"
                    backgroundColor="$red3"
                    borderColor="$red7"
                    borderWidth={1}
                    borderRadius="$2"
                    paddingHorizontal="$2"
                    disabled={mutating}
                    onPress={() =>
                      void setTradeBlock({
                        variables: {
                          teamMemberId: member.id!,
                          onTradeBlock: false,
                        },
                      })
                    }
                  >
                    <Text fontSize="$1" fontWeight="600" color="$red11">
                      Remove
                    </Text>
                  </Button>
                ) : (
                  <XStack
                    backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.18)}
                    borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.4)}
                    borderWidth={1}
                    borderRadius="$2"
                    paddingHorizontal="$2"
                    paddingVertical="$0.5"
                  >
                    <Text
                      fontSize="$1"
                      fontWeight="600"
                      color={BRAND_GOLD_LIGHT}
                    >
                      AVAILABLE
                    </Text>
                  </XStack>
                )}
              </XStack>
              {idx < displayList.length - 1 && (
                <Separator borderColor="$outlineSubtle" />
              )}
            </React.Fragment>
          );
        })}
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
            {expanded ? 'Show fewer' : `Show ${players.length - 5} more`}
          </Text>
        </Button>
      )}
    </Card>
  );
}
