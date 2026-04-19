import React, { useState } from 'react';
import { Button, Input, Text, XStack, YStack } from 'tamagui';
import { useSearchPlayersForTwentyQuestionsLazyQuery } from '../../api/db/graphql.generated';

interface PlayerSuggestion {
  id: number;
  firstName: string | null | undefined;
  lastName: string | null | undefined;
}

interface PlayerGuessProps {
  onGuess: (playerId: number) => void;
  guessing: boolean;
}

export const PlayerGuess: React.FC<PlayerGuessProps> = ({
  onGuess,
  guessing,
}) => {
  const [guessText, setGuessText] = useState('');
  const [suggestions, setSuggestions] = useState<PlayerSuggestion[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerSuggestion | null>(
    null,
  );

  const [searchPlayers, { loading: searching }] =
    useSearchPlayersForTwentyQuestionsLazyQuery();

  const handleInput = async (text: string) => {
    setGuessText(text);
    setSelectedPlayer(null);
    if (text.length < 2) {
      setSuggestions([]);
      return;
    }
    const { data } = await searchPlayers({
      variables: { searchTerm: text, limit: 8 },
    });
    const players = (data?.searchPlayers ?? []).filter(
      (p): p is PlayerSuggestion => p.id != null,
    );
    setSuggestions(players);
  };

  const handleSelect = (player: PlayerSuggestion) => {
    setSelectedPlayer(player);
    setGuessText(`${player.firstName ?? ''} ${player.lastName ?? ''}`.trim());
    setSuggestions([]);
  };

  const handleSubmit = () => {
    if (!selectedPlayer) return;
    onGuess(selectedPlayer.id);
    setGuessText('');
    setSelectedPlayer(null);
    setSuggestions([]);
  };

  return (
    <YStack gap="$2" testID="player-guess">
      <Input
        size="$4"
        placeholder="Type player name to guess…"
        value={guessText}
        onChangeText={(text: string) => void handleInput(text)}
        testID="guess-input"
      />

      {suggestions.length > 0 && (
        <YStack
          backgroundColor="$background"
          borderWidth={1}
          borderColor="$gray6"
          borderRadius="$3"
          overflow="hidden"
          testID="player-suggestions"
        >
          {suggestions.map((p) => (
            <XStack
              key={p.id}
              paddingHorizontal="$3"
              paddingVertical="$2"
              pressStyle={{ backgroundColor: '$gray3' }}
              onPress={() => handleSelect(p)}
              testID={`suggestion-${p.id}`}
            >
              <Text>
                {p.firstName} {p.lastName}
              </Text>
            </XStack>
          ))}
        </YStack>
      )}

      {searching && (
        <Text color="$gray9" fontSize="$2">
          Searching…
        </Text>
      )}

      <Button
        size="$4"
        theme="green"
        onPress={handleSubmit}
        disabled={!selectedPlayer || guessing}
        testID="submit-guess-button"
      >
        {guessing ? 'Checking…' : 'Guess Player'}
      </Button>
    </YStack>
  );
};
