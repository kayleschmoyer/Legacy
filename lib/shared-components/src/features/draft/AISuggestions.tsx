import React from 'react';
import { Button, ScrollView, Text, YStack } from 'tamagui';
import { Player } from './PlayerCard';

interface AISuggestionsProps {
  suggestions: Player[];
  onPick: (id: string) => void;
}

export const AISuggestions: React.FC<AISuggestionsProps> = ({ suggestions, onPick }) => {
  return (
    <YStack flex={1}>
      <Text fontSize="$6" fontWeight="bold" marginBottom="$2">AI Suggestions</Text>
      <ScrollView>
        {suggestions.map(player => (
          <YStack key={player.id} padding="$2" borderBottomWidth={1} borderBottomColor="$borderColor">
            <Text>{player.name} - {player.position}</Text>
            <Button size="$2" onPress={() => onPick(player.id)}>Pick</Button>
          </YStack>
        ))}
      </ScrollView>
    </YStack>
  );
};
