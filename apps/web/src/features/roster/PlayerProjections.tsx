import React from 'react';
import { Card, Separator, Text, XStack, YStack } from 'tamagui';
import {
  AMBER,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  SURFACE_PANEL,
  SURFACE_SUBTLE,
  VIOLET,
  withAlpha,
} from '../../constants/colors';

export interface PlayerProjection {
  playerId: number;
  playerName: string;
  matchupProjection: number;
  careerProjection: number;
  selectedGamesCount: number;
  accumulatedStats?: Record<string, number>;
}

export interface PlayerProjectionsProps {
  projections: PlayerProjection[];
  gamesRemaining: number;
  loading?: boolean;
  error?: Error | null;
}

/**
 * PlayerProjections — Displays matchup and career projections in a compact
 * table-style card that matches the modernized roster UI.
 */
export function PlayerProjections({
  projections,
  gamesRemaining,
  loading = false,
  error = null,
}: PlayerProjectionsProps) {
  if (loading) {
    return (
      <Card
        backgroundColor="$surfacePanel"
        borderColor="$surfacePanelBorder"
        borderWidth={1}
        borderRadius="$5"
        padding="$5"
        alignItems="center"
      >
        <Text color="$textMuted" fontSize="$3">
          Loading projections…
        </Text>
      </Card>
    );
  }

  if (error) {
    return (
      <Card
        backgroundColor="$surfacePanel"
        borderColor="$red6"
        borderWidth={1}
        borderRadius="$5"
        padding="$4"
      >
        <Text color="$red10" fontSize="$3">
          Error: {error.message}
        </Text>
      </Card>
    );
  }

  if (projections.length === 0) {
    return (
      <Card
        backgroundColor="$surfacePanel"
        borderColor="$surfacePanelBorder"
        borderWidth={1}
        borderRadius="$5"
        padding="$5"
        alignItems="center"
      >
        <Text color="$textMuted" fontSize="$3">
          No player projections available
        </Text>
      </Card>
    );
  }

  return (
    <Card
      backgroundColor={withAlpha(SURFACE_PANEL, 0.7)}
      borderColor="$surfacePanelBorder"
      borderWidth={1}
      borderRadius="$5"
      overflow="hidden"
      width="100%"
      style={{
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      {/* Gradient accent bar */}
      <YStack
        height={2}
        width="100%"
        style={{
          background: `linear-gradient(90deg, ${BRAND_NAVY_LIGHT}, ${VIOLET}, transparent)`,
        }}
      />
      {/* Title bar */}
      <XStack
        paddingHorizontal="$3"
        paddingVertical="$2.5"
        backgroundColor={withAlpha(SURFACE_SUBTLE, 0.6)}
        justifyContent="space-between"
        alignItems="center"
      >
        <Text
          fontSize="$2"
          fontWeight="700"
          color="$textMuted"
          textTransform="uppercase"
          letterSpacing={0.8}
        >
          Projections
        </Text>
        {gamesRemaining > 0 && (
          <Text
            fontSize={10}
            fontWeight="700"
            color="$amber9"
            backgroundColor={withAlpha(AMBER, 0.12)}
            paddingHorizontal="$1.5"
            paddingVertical={2}
            borderRadius="$2"
          >
            {gamesRemaining} games left
          </Text>
        )}
      </XStack>

      {/* Column header */}
      <XStack
        paddingVertical="$1.5"
        paddingHorizontal="$3"
        borderBottomWidth={1}
        borderBottomColor="$outlineSubtle"
        gap="$2"
      >
        <Text
          flex={1}
          fontSize="$1"
          fontWeight="700"
          color="$textMuted"
          textTransform="uppercase"
          letterSpacing={0.6}
        >
          Player
        </Text>
        <Text
          width={70}
          fontSize="$1"
          fontWeight="700"
          color={BRAND_GOLD_LIGHT}
          textTransform="uppercase"
          letterSpacing={0.6}
          textAlign="center"
        >
          Matchup
        </Text>
        <Text
          width={70}
          fontSize="$1"
          fontWeight="700"
          color="$textMuted"
          textTransform="uppercase"
          letterSpacing={0.6}
          textAlign="center"
        >
          Career
        </Text>
        <Text
          width={50}
          fontSize="$1"
          fontWeight="700"
          color="$textMuted"
          textTransform="uppercase"
          letterSpacing={0.6}
          textAlign="center"
          display="none"
          $gtSm={{ display: 'flex' }}
        >
          GP
        </Text>
      </XStack>

      {/* Player rows */}
      <YStack>
        {projections.map((player, index) => (
          <React.Fragment key={player.playerId}>
            <XStack
              paddingVertical="$2.5"
              paddingHorizontal="$3"
              backgroundColor={
                index % 2 === 0 ? '$background' : '$surfaceSubtle'
              }
              gap="$2"
              alignItems="center"
              minHeight={44}
              animation="quick"
              hoverStyle={{ backgroundColor: '$surfaceCard' }}
              pressStyle={{ scale: 0.995, opacity: 0.9 }}
            >
              <Text
                flex={1}
                fontSize="$3"
                fontWeight="600"
                color="$color12"
                numberOfLines={1}
              >
                {player.playerName}
              </Text>
              <Text
                width={70}
                fontSize="$3"
                fontWeight="700"
                color={BRAND_GOLD_LIGHT}
                textAlign="center"
              >
                {player.matchupProjection.toFixed(2)}
              </Text>
              <Text
                width={70}
                fontSize="$3"
                color="$textMuted"
                textAlign="center"
              >
                {player.careerProjection.toFixed(2)}
              </Text>
              <Text
                width={50}
                fontSize="$2"
                color="$textMuted"
                textAlign="center"
                display="none"
                $gtSm={{ display: 'flex' }}
              >
                {player.selectedGamesCount}
              </Text>
            </XStack>
            {index < projections.length - 1 && (
              <Separator borderColor="$outlineSubtle" marginVertical={0} />
            )}
          </React.Fragment>
        ))}
      </YStack>

      {/* Footer legend */}
      <XStack
        paddingVertical="$2"
        paddingHorizontal="$3"
        borderTopWidth={1}
        borderTopColor="$outlineSubtle"
        gap="$4"
        justifyContent="center"
        flexWrap="wrap"
      >
        <XStack gap="$1" alignItems="center">
          <YStack
            width={8}
            height={8}
            backgroundColor={BRAND_NAVY_LIGHT}
            borderRadius={4}
          />
          <Text fontSize="$1" color="$textMuted">
            Matchup
          </Text>
        </XStack>
        <XStack gap="$1" alignItems="center">
          <YStack
            width={8}
            height={8}
            backgroundColor="$textMuted"
            borderRadius={4}
          />
          <Text fontSize="$1" color="$textMuted">
            Career avg
          </Text>
        </XStack>
      </XStack>
    </Card>
  );
}
