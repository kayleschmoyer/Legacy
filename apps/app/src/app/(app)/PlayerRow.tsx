import React from 'react';
import { Button, Text, XStack } from 'tamagui';
import { Player } from './DraftBoardPage';

const PlayerRow: React.FC<{
  player: Player;
  onDraft: (player: Player) => void;
}> = ({ player, onDraft }) => {
  return (
    <Button
      onPress={() => onDraft(player)}
      backgroundColor="rgba(40, 40, 40, 0.9)"
      borderRadius={0}
      padding={0}
      justifyContent="space-between"
      pressStyle={{ backgroundColor: 'rgba(50, 50, 50, 0.9)' }}
    >
      <XStack flex={1} justifyContent="space-between">
        <Text
          borderBottomColor="rgba(255, 255, 255, 0.2)"
          borderBottomWidth={1}
          color="rgba(255, 255, 255, 0.9)"
          flex={1}
          padding="$3"
          textAlign="left"
        >
          {player.player}
        </Text>
        <Text
          borderBottomColor="rgba(255, 255, 255, 0.2)"
          borderBottomWidth={1}
          color="rgba(255, 255, 255, 0.9)"
          flex={1}
          padding="$3"
          textAlign="center"
        >
          {player.pos}
        </Text>
        <Text
          borderBottomColor="rgba(255, 255, 255, 0.2)"
          borderBottomWidth={1}
          color="rgba(255, 255, 255, 0.9)"
          flex={1}
          padding="$3"
          textAlign="left"
        >
          {player.team}
        </Text>
        <Text
          borderBottomColor="rgba(255, 255, 255, 0.2)"
          borderBottomWidth={1}
          color="rgba(255, 255, 255, 0.9)"
          flex={1}
          padding="$3"
          textAlign="center"
        >
          {player.hr}
        </Text>
        <Text
          borderBottomColor="rgba(255, 255, 255, 0.2)"
          borderBottomWidth={1}
          color="rgba(255, 255, 255, 0.9)"
          flex={1}
          padding="$3"
          textAlign="center"
        >
          {player.avg}
        </Text>
        <Text
          borderBottomColor="rgba(255, 255, 255, 0.2)"
          borderBottomWidth={1}
          color="rgba(255, 255, 255, 0.9)"
          flex={1}
          padding="$3"
          textAlign="center"
        >
          {player.rbi}
        </Text>
        <Text
          borderBottomColor="rgba(255, 255, 255, 0.2)"
          borderBottomWidth={1}
          color="rgba(255, 255, 255, 0.9)"
          flex={1}
          padding="$3"
          textAlign="left"
        >
          {player.legacy}
        </Text>
        <Text
          borderBottomColor="rgba(255, 255, 255, 0.2)"
          borderBottomWidth={1}
          color="rgba(255, 255, 255, 0.9)"
          flex={1}
          padding="$3"
          textAlign="center"
        >
          {player.fantasyPoints}
        </Text>
        <Text
          borderBottomColor="rgba(255, 255, 255, 0.2)"
          borderBottomWidth={1}
          color="rgba(255, 255, 255, 0.9)"
          flex={1}
          padding="$3"
          textAlign="center"
        >
          {player.projectedPoints}
        </Text>
        <Text
          borderBottomColor="rgba(255, 255, 255, 0.2)"
          borderBottomWidth={1}
          color="rgba(255, 255, 255, 0.9)"
          flex={1}
          padding="$3"
          textAlign="center"
        >
          {player.gamesPlayed}
        </Text>
        <Text
          borderBottomColor="rgba(255, 255, 255, 0.2)"
          borderBottomWidth={1}
          color="rgba(255, 255, 255, 0.9)"
          flex={1}
          padding="$3"
          textAlign="center"
        >
          {player.runs}
        </Text>
        <Text
          borderBottomColor="rgba(255, 255, 255, 0.2)"
          borderBottomWidth={1}
          color="rgba(255, 255, 255, 0.9)"
          flex={1}
          padding="$3"
          textAlign="center"
        >
          {player.hits}
        </Text>
        <Text
          borderBottomColor="rgba(255, 255, 255, 0.2)"
          borderBottomWidth={1}
          color="rgba(255, 255, 255, 0.9)"
          flex={1}
          padding="$3"
          textAlign="center"
        >
          {player.strikeouts}
        </Text>
        <Text
          borderBottomColor="rgba(255, 255, 255, 0.2)"
          borderBottomWidth={1}
          color="rgba(255, 255, 255, 0.9)"
          flex={1}
          padding="$3"
          textAlign="center"
        >
          {player.walks}
        </Text>
        <Text
          borderBottomColor="rgba(255, 255, 255, 0.2)"
          borderBottomWidth={1}
          color="rgba(255, 255, 255, 0.9)"
          flex={1}
          padding="$3"
          textAlign="center"
        >
          {player.obp}
        </Text>
      </XStack>
    </Button>
  );
};

export default PlayerRow;
