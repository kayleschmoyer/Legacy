import React, { useState } from 'react';
import {
  Button,
  Input,
  Paragraph,
  ScrollView,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import {
  useGiveUpDisclosureGameMutation,
  useNextClueMutation,
  useSearchPlayersForDisclosureLazyQuery,
  useStartDisclosureGameMutation,
  useSubmitGuessMutation,
} from '../../api/db/graphql.generated';

/**
 * Progressive Disclosure Minigame (LS-1883 / LS-2113)
 *
 * A guessing game where baseball player facts are revealed one at a time.
 * Fewer clues used = higher score.
 *
 * States:
 *  - idle       : before a game starts (shows "Start Game" button)
 *  - playing    : session active, clue feed + guess input + controls
 *  - result     : session ended (won / lost / given_up), shows outcome + score
 */

// ── Types ──────────────────────────────────────────────────────────────────

interface Clue {
  clueText: string;
  difficultyTier: string;
  clueIndex: number;
}

interface PlayerSuggestion {
  id: number;
  firstName: string | null | undefined;
  lastName: string | null | undefined;
}

type GamePhase = 'idle' | 'playing' | 'result';

interface ResultState {
  outcome: 'won' | 'lost' | 'given_up';
  score: number;
  cluesUsed: number;
  correctPlayerId: number | null;
  correctPlayerName: string | null;
}

// ── Props ──────────────────────────────────────────────────────────────────

export interface DisclosureGameProps {
  onBack: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export const DisclosureGame: React.FC<DisclosureGameProps> = ({ onBack }) => {
  // ── Session state ──────────────────────────────────────────────────────
  const [phase, setPhase] = useState<GamePhase>('idle');
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [totalClues, setTotalClues] = useState(0);
  const [revealedClues, setRevealedClues] = useState<Clue[]>([]);
  const [isLastClue, setIsLastClue] = useState(false);
  const [result, setResult] = useState<ResultState | null>(null);

  // ── Guess input state ──────────────────────────────────────────────────
  const [guessText, setGuessText] = useState('');
  const [suggestions, setSuggestions] = useState<PlayerSuggestion[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerSuggestion | null>(
    null,
  );

  // ── Error state ────────────────────────────────────────────────────────
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ── GraphQL hooks ──────────────────────────────────────────────────────
  const [startGame, { loading: starting }] = useStartDisclosureGameMutation();
  const [revealClue, { loading: revealing }] = useNextClueMutation();
  const [guess, { loading: guessing }] = useSubmitGuessMutation();
  const [giveUp, { loading: givingUp }] = useGiveUpDisclosureGameMutation();
  const [searchPlayers, { loading: searching }] =
    useSearchPlayersForDisclosureLazyQuery();

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleStart = async () => {
    setErrorMsg(null);
    try {
      const { data } = await startGame();
      const session = data?.startDisclosureGame;
      if (!session || session.sessionId == null || session.totalClues == null)
        throw new Error('Failed to start game');
      setSessionId(session.sessionId);
      setTotalClues(session.totalClues);
      setRevealedClues([]);
      setIsLastClue(false);
      setGuessText('');
      setSuggestions([]);
      setSelectedPlayer(null);
      setResult(null);
      setPhase('playing');
    } catch (_e) {
      setErrorMsg('Could not start a game. Please try again.');
    }
  };

  const handleNextClue = async () => {
    if (!sessionId) return;
    setErrorMsg(null);
    try {
      const { data } = await revealClue({ variables: { sessionId } });
      const clue = data?.nextClue;
      if (!clue?.clueText || clue.clueIndex == null)
        throw new Error('No clue returned');
      setRevealedClues((prev) => [
        ...prev,
        {
          clueText: clue.clueText ?? '',
          difficultyTier: clue.difficultyTier ?? 'vague',
          clueIndex: clue.clueIndex ?? 0,
        },
      ]);
      setIsLastClue(clue.isLastClue ?? false);
    } catch (_e) {
      setErrorMsg('Could not reveal clue. Please try again.');
    }
  };

  const handleGuessInput = async (text: string) => {
    setGuessText(text);
    setSelectedPlayer(null);
    if (text.length < 2) {
      setSuggestions([]);
      return;
    }
    try {
      const { data } = await searchPlayers({
        variables: { searchTerm: text, limit: 8 },
      });
      const players = (data?.searchPlayers ?? []).filter(
        (p): p is PlayerSuggestion => p.id != null,
      );
      setSuggestions(players);
    } catch (_e) {
      setSuggestions([]);
      setErrorMsg('Could not search players. Please try again.');
    }
  };

  const handleSelectSuggestion = (player: PlayerSuggestion) => {
    setSelectedPlayer(player);
    setGuessText(`${player.firstName ?? ''} ${player.lastName ?? ''}`.trim());
    setSuggestions([]);
  };

  const handleSubmitGuess = async () => {
    if (!sessionId || !selectedPlayer) return;
    setErrorMsg(null);
    try {
      const { data } = await guess({
        variables: { sessionId, guessedPlayerId: selectedPlayer.id },
      });
      const res = data?.submitGuess;
      if (!res) throw new Error('No result returned');
      if (res.correct) {
        setResult({
          outcome: 'won',
          score: res.score ?? 0,
          cluesUsed: res.cluesUsed ?? 0,
          correctPlayerId: null,
          correctPlayerName: null,
        });
        setPhase('result');
      } else if (
        typeof totalClues === 'number' &&
        revealedClues.length >= totalClues
      ) {
        setResult({
          outcome: 'lost',
          score: 0,
          cluesUsed: revealedClues.length,
          correctPlayerId: res.correctPlayerId ?? null,
          correctPlayerName: null,
        });
        setPhase('result');
      } else {
        setErrorMsg('Wrong guess — reveal more clues and try again.');
        setGuessText('');
        setSelectedPlayer(null);
        setSuggestions([]);
      }
    } catch (_e) {
      setErrorMsg('Could not submit guess. Please try again.');
    }
  };

  const handleGiveUp = async () => {
    if (!sessionId) return;
    setErrorMsg(null);
    try {
      const { data } = await giveUp({ variables: { sessionId } });
      const res = data?.giveUpDisclosureGame;
      if (!res) throw new Error('No result returned');
      setResult({
        outcome: 'given_up',
        score: 0,
        cluesUsed: revealedClues.length,
        correctPlayerId: res.correctPlayerId ?? null,
        correctPlayerName: res.correctPlayerName ?? null,
      });
      setPhase('result');
    } catch (_e) {
      setErrorMsg('Could not give up. Please try again.');
    }
  };

  const handlePlayAgain = () => {
    setPhase('idle');
    setSessionId(null);
    setRevealedClues([]);
    setResult(null);
    setGuessText('');
    setSuggestions([]);
    setSelectedPlayer(null);
    setIsLastClue(false);
    setErrorMsg(null);
  };

  // ── Render ─────────────────────────────────────────────────────────────

  // ─── Idle ────────────────────────────────────────────────────────────
  if (phase === 'idle') {
    return (
      <YStack
        flex={1}
        alignItems="center"
        justifyContent="center"
        padding="$6"
        gap="$4"
        testID="disclosure-game-idle"
      >
        <Text fontSize="$8" fontWeight="700" textAlign="center">
          Who Am I?
        </Text>
        <Paragraph textAlign="center" color="$gray11" maxWidth={320}>
          Baseball player facts are revealed one at a time. Guess the player
          with as few clues as possible for a higher score.
        </Paragraph>
        <Button
          size="$5"
          theme="blue"
          onPress={() => void handleStart()}
          disabled={starting}
          testID="start-game-button"
        >
          {starting ? 'Starting…' : 'Start Game'}
        </Button>
        <Button size="$3" chromeless onPress={onBack} testID="back-button">
          Back
        </Button>
      </YStack>
    );
  }

  // ─── Result ───────────────────────────────────────────────────────────
  if (phase === 'result' && result) {
    const won = result.outcome === 'won';
    const givenUp = result.outcome === 'given_up';

    return (
      <YStack
        flex={1}
        alignItems="center"
        justifyContent="center"
        padding="$6"
        gap="$4"
        testID="disclosure-game-result"
      >
        <Text
          fontSize="$9"
          fontWeight="800"
          testID="result-emoji"
          role="img"
          accessibilityLabel={
            won ? 'trophy' : givenUp ? 'white flag' : 'cross mark'
          }
        >
          {won ? '🏆' : givenUp ? '🏳️' : '❌'}
        </Text>
        <Text fontSize="$7" fontWeight="700" testID="result-headline">
          {won
            ? 'Correct!'
            : givenUp
              ? 'Better luck next time'
              : 'Out of clues'}
        </Text>
        {won && (
          <Text
            fontSize="$6"
            fontWeight="600"
            color="$blue10"
            testID="result-score"
          >
            {result.score} points
          </Text>
        )}
        <Paragraph color="$gray11" testID="result-clues-used">
          Clues used: {result.cluesUsed} / {totalClues}
        </Paragraph>
        {(result.correctPlayerName || result.correctPlayerId) && (
          <Paragraph color="$gray10" testID="result-correct-player">
            The player was:{' '}
            {result.correctPlayerName || String(result.correctPlayerId)}
          </Paragraph>
        )}
        <Button
          size="$5"
          theme="blue"
          onPress={handlePlayAgain}
          testID="play-again-button"
        >
          Play Again
        </Button>
        <Button size="$3" chromeless onPress={onBack} testID="back-button">
          Back
        </Button>
      </YStack>
    );
  }

  // ─── Playing ──────────────────────────────────────────────────────────
  const canReveal = revealedClues.length < totalClues && !isLastClue;
  const hasRevealedAny = revealedClues.length > 0;

  return (
    <YStack flex={1} padding="$4" gap="$3" testID="disclosure-game-playing">
      {/* Header */}
      <XStack justifyContent="space-between" alignItems="center">
        <Text fontSize="$5" fontWeight="700">
          Who Am I?
        </Text>
        <Text color="$gray10" fontSize="$3" testID="clue-counter">
          {revealedClues.length} / {totalClues} clues
        </Text>
      </XStack>

      {/* Error banner */}
      {errorMsg && (
        <Paragraph color="$red10" fontSize="$3" testID="error-message">
          {errorMsg}
        </Paragraph>
      )}

      {/* Clue feed */}
      <ScrollView flex={1} testID="clue-feed">
        {!hasRevealedAny && (
          <Paragraph color="$gray10" textAlign="center" paddingVertical="$6">
            Reveal the first clue to begin.
          </Paragraph>
        )}
        <YStack gap="$2">
          {revealedClues.map((clue) => (
            <YStack
              key={clue.clueIndex}
              backgroundColor="$gray2"
              borderRadius="$3"
              padding="$3"
              testID={`clue-${clue.clueIndex}`}
            >
              <Text fontSize="$2" color="$gray9" marginBottom="$1">
                Clue {clue.clueIndex} · {clue.difficultyTier}
              </Text>
              <Paragraph fontSize="$4">{clue.clueText}</Paragraph>
            </YStack>
          ))}
        </YStack>
      </ScrollView>

      {/* Controls */}
      <YStack gap="$2">
        {/* Next Clue */}
        {canReveal && (
          <Button
            size="$4"
            variant="outlined"
            onPress={() => void handleNextClue()}
            disabled={revealing}
            testID="next-clue-button"
          >
            {revealing ? 'Revealing…' : 'Next Clue'}
          </Button>
        )}

        {/* Guess input */}
        {hasRevealedAny && (
          <YStack gap="$2">
            <Input
              size="$4"
              placeholder="Type player name…"
              value={guessText}
              onChangeText={(text: string) => void handleGuessInput(text)}
              testID="guess-input"
            />
            {/* Autocomplete suggestions */}
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
                    onPress={() => handleSelectSuggestion(p)}
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
              onPress={() => void handleSubmitGuess()}
              disabled={!selectedPlayer || guessing}
              testID="submit-guess-button"
            >
              {guessing ? 'Checking…' : 'Submit Guess'}
            </Button>
          </YStack>
        )}

        {/* Give Up */}
        {hasRevealedAny && (
          <Button
            size="$3"
            theme="red"
            chromeless
            onPress={() => void handleGiveUp()}
            disabled={givingUp}
            testID="give-up-button"
          >
            {givingUp ? 'Giving up…' : 'Give Up'}
          </Button>
        )}
      </YStack>
    </YStack>
  );
};
