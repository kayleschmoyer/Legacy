import React from 'react';
import { Button, Text, XStack } from 'tamagui';

// Generic player interface to avoid dependencies
export interface PlayerRowData {
  player: string;
  pos: string;
  team: string;
  hr: number | string;
  avg: number | string;
  rbi: number | string;
  legacy: string;
  fantasyPoints: number | string;
  projectedPoints: number | string;
  gamesPlayed: number | string;
  runs: number | string;
  hits: number | string;
  strikeouts: number | string;
  walks: number | string;
  obp: number | string;
}

export interface PlayerRowProps {
  player: PlayerRowData;
  onDraft: (player: PlayerRowData) => void;
}

function PlayerRow({ player, onDraft }: PlayerRowProps) {
  return (
    <Button
      onPress={() => onDraft(player)}
      backgroundColor="rgba(40, 40, 40, 0.9)"
      borderWidth={0}
      borderBottomWidth={1}
      borderBottomColor="rgba(255, 255, 255, 0.2)"
      borderRadius={0}
      padding={0}
      unstyled
    >
      <XStack flex={1} justifyContent="space-between">
        <Text
          flex={1}
          padding="$3"
          textAlign="left"
          color="rgba(255, 255, 255, 0.9)"
        >
          {player.player}
        </Text>
        <Text
          flex={1}
          padding="$3"
          textAlign="center"
          color="rgba(255, 255, 255, 0.9)"
        >
          {player.pos}
        </Text>
        <Text
          flex={1}
          padding="$3"
          textAlign="left"
          color="rgba(255, 255, 255, 0.9)"
        >
          {player.team}
        </Text>
        <Text
          flex={1}
          padding="$3"
          textAlign="center"
          color="rgba(255, 255, 255, 0.9)"
        >
          {player.hr}
        </Text>
        <Text
          flex={1}
          padding="$3"
          textAlign="center"
          color="rgba(255, 255, 255, 0.9)"
        >
          {player.avg}
        </Text>
        <Text
          flex={1}
          padding="$3"
          textAlign="center"
          color="rgba(255, 255, 255, 0.9)"
        >
          {player.rbi}
        </Text>
        <Text
          flex={1}
          padding="$3"
          textAlign="left"
          color="rgba(255, 255, 255, 0.9)"
        >
          {player.legacy}
        </Text>
        <Text
          flex={1}
          padding="$3"
          textAlign="center"
          color="rgba(255, 255, 255, 0.9)"
        >
          {player.fantasyPoints}
        </Text>
        <Text
          flex={1}
          padding="$3"
          textAlign="center"
          color="rgba(255, 255, 255, 0.9)"
        >
          {player.projectedPoints}
        </Text>
        <Text
          flex={1}
          padding="$3"
          textAlign="center"
          color="rgba(255, 255, 255, 0.9)"
        >
          {player.gamesPlayed}
        </Text>
        <Text
          flex={1}
          padding="$3"
          textAlign="center"
          color="rgba(255, 255, 255, 0.9)"
        >
          {player.runs}
        </Text>
        <Text
          flex={1}
          padding="$3"
          textAlign="center"
          color="rgba(255, 255, 255, 0.9)"
        >
          {player.hits}
        </Text>
        <Text
          flex={1}
          padding="$3"
          textAlign="center"
          color="rgba(255, 255, 255, 0.9)"
        >
          {player.strikeouts}
        </Text>
        <Text
          flex={1}
          padding="$3"
          textAlign="center"
          color="rgba(255, 255, 255, 0.9)"
        >
          {player.walks}
        </Text>
        <Text
          flex={1}
          padding="$3"
          textAlign="center"
          color="rgba(255, 255, 255, 0.9)"
        >
          {player.obp}
        </Text>
      </XStack>
    </Button>
  );
}

export { PlayerRow };
