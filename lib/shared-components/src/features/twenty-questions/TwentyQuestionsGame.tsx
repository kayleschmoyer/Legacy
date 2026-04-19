import React, { useEffect, useState } from 'react';
import { Button, Paragraph, Text, XStack, YStack } from 'tamagui';
import { GameResult } from './GameResult';
import { PlayerGuess } from './PlayerGuess';
import { type AskPayload, QuestionBuilder } from './QuestionBuilder';
import { QuestionHistory, type QuestionRecord } from './QuestionHistory';
import { TwentyQuestionsEntry } from './TwentyQuestionsEntry';
import {
  TwentyQuestionsCategory,
  TwentyQuestionsDifficulty,
  TwentyQuestionsStatus,
  useTwentyQuestionsAbandonMutation,
  useTwentyQuestionsActiveGameLazyQuery,
  useTwentyQuestionsAskMutation,
  useTwentyQuestionsGuessMutation,
  useTwentyQuestionsStartMutation,
} from '../../api/db/graphql.generated';

/**
 * 20 Questions Minigame (LS-1793)
 *
 * Ask yes/no questions about a mystery baseball player.
 * Guess the player sooner for a higher token reward.
 *
 * Phases:
 *  - entry   : difficulty selection + start / resume
 *  - playing : question builder, history, player guess, abandon
 *  - result  : outcome display with tokens and player reveal
 */

type Phase = 'entry' | 'playing' | 'result';

interface RawGame {
  id?: string | null;
  status?: TwentyQuestionsStatus | null;
  questionsUsed?: number | null;
  maxQuestions?: number | null;
  tokensEarned?: number | null;
  questions?: Array<{
    questionNumber?: number | null;
    category?: TwentyQuestionsCategory | null;
    parameter?: string | null;
    answer?: boolean | null;
    isGuess?: boolean | null;
  }> | null;
  targetPlayer?: {
    id?: number | null;
    firstName?: string | null;
    lastName?: string | null;
    eligiblePositions?: string[] | null;
  } | null;
}

interface GameState {
  id: string;
  status: TwentyQuestionsStatus;
  questionsUsed: number;
  maxQuestions: number;
  tokensEarned: number | null;
  questions: QuestionRecord[];
  targetPlayer: {
    id?: number | null;
    firstName?: string | null;
    lastName?: string | null;
    eligiblePositions?: string[] | null;
  } | null;
}

export interface TwentyQuestionsGameProps {
  onBack: () => void;
}

function mapGame(raw: RawGame): GameState | null {
  if (!raw.id) return null;
  return {
    id: raw.id,
    status: raw.status ?? TwentyQuestionsStatus.Active,
    questionsUsed: raw.questionsUsed ?? 0,
    maxQuestions: raw.maxQuestions ?? 20,
    tokensEarned: raw.tokensEarned ?? null,
    questions: (raw.questions ?? []).flatMap((q) => {
      if (
        q.questionNumber == null ||
        q.category == null ||
        q.parameter == null ||
        q.answer == null ||
        q.isGuess == null
      )
        return [];
      return [
        {
          questionNumber: q.questionNumber,
          category: q.category,
          parameter: q.parameter,
          answer: q.answer,
          isGuess: q.isGuess,
        } satisfies QuestionRecord,
      ];
    }),
    targetPlayer: raw.targetPlayer ?? null,
  };
}

export const TwentyQuestionsGame: React.FC<TwentyQuestionsGameProps> = ({
  onBack,
}) => {
  const [phase, setPhase] = useState<Phase>('entry');
  const [difficulty, setDifficulty] = useState(
    TwentyQuestionsDifficulty.Medium,
  );
  const [game, setGame] = useState<GameState | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hasActiveGame, setHasActiveGame] = useState(false);

  const [fetchActiveGame, { loading: checkingActive }] =
    useTwentyQuestionsActiveGameLazyQuery({ fetchPolicy: 'network-only' });
  const [startGame, { loading: starting }] = useTwentyQuestionsStartMutation();
  const [askQuestion, { loading: asking }] = useTwentyQuestionsAskMutation();
  const [guessPlayer, { loading: guessing }] =
    useTwentyQuestionsGuessMutation();
  const [abandonGame, { loading: abandoning }] =
    useTwentyQuestionsAbandonMutation();

  // On mount, check for an in-progress game. Populate game state but stay
  // on the entry screen so the user can choose to resume.
  useEffect(() => {
    void (async () => {
      const { data } = await fetchActiveGame();
      const active = data?.twentyQuestionsActiveGame;
      if (active?.id) {
        const mapped = mapGame(active);
        if (mapped) {
          setGame(mapped);
          setHasActiveGame(true);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStart = async () => {
    setErrorMsg(null);
    // Resume: existing game state already loaded — just switch phase
    if (hasActiveGame && game) {
      setPhase('playing');
      return;
    }
    // New game
    try {
      const { data } = await startGame({ variables: { difficulty } });
      const raw = data?.twentyQuestionsStart;
      const mapped = mapGame(raw ?? {});
      if (!mapped) throw new Error('Failed to start game');
      setGame(mapped);
      setPhase('playing');
    } catch (e) {
      setErrorMsg(
        e instanceof Error
          ? e.message
          : 'Could not start game. Please try again.',
      );
    }
  };

  const handleAsk = async (payload: AskPayload) => {
    if (!game?.id) return;
    setErrorMsg(null);
    try {
      const { data } = await askQuestion({
        variables: {
          input: {
            gameId: game.id,
            category: payload.category,
            parameter: payload.parameter,
          },
        },
      });
      const raw = data?.twentyQuestionsAsk;
      const mapped = mapGame(raw ?? {});
      if (!mapped) throw new Error('No game state returned');
      setGame(mapped);
      if (
        mapped.status === TwentyQuestionsStatus.Lost ||
        mapped.status === TwentyQuestionsStatus.Won
      ) {
        setPhase('result');
      }
    } catch (e) {
      setErrorMsg(
        e instanceof Error
          ? e.message
          : 'Could not ask question. Please try again.',
      );
    }
  };

  const handleGuess = async (playerId: number) => {
    if (!game?.id) return;
    setErrorMsg(null);
    try {
      const { data } = await guessPlayer({
        variables: { gameId: game.id, playerId },
      });
      const raw = data?.twentyQuestionsGuess;
      const mapped = mapGame(raw ?? {});
      if (!mapped) throw new Error('No game state returned');
      setGame(mapped);
      if (
        mapped.status === TwentyQuestionsStatus.Won ||
        mapped.status === TwentyQuestionsStatus.Lost
      ) {
        setPhase('result');
      } else {
        setErrorMsg('Wrong guess — keep asking questions and try again.');
      }
    } catch (e) {
      setErrorMsg(
        e instanceof Error
          ? e.message
          : 'Could not submit guess. Please try again.',
      );
    }
  };

  const handleAbandon = async () => {
    if (!game?.id) return;
    setErrorMsg(null);
    try {
      const { data } = await abandonGame({
        variables: { gameId: game.id },
      });
      const raw = data?.twentyQuestionsAbandon;
      const mapped = mapGame(raw ?? {});
      if (!mapped) throw new Error('No game state returned');
      setGame(mapped);
      setPhase('result');
    } catch (e) {
      setErrorMsg(
        e instanceof Error
          ? e.message
          : 'Could not abandon game. Please try again.',
      );
    }
  };

  const handlePlayAgain = () => {
    setGame(null);
    setHasActiveGame(false);
    setErrorMsg(null);
    setPhase('entry');
  };

  // ── Entry ──────────────────────────────────────────────────────────────
  if (phase === 'entry') {
    return (
      <YStack flex={1} testID="twenty-questions-game">
        {checkingActive ? (
          <YStack flex={1} alignItems="center" justifyContent="center">
            <Text color="$gray10">Loading…</Text>
          </YStack>
        ) : (
          <TwentyQuestionsEntry
            difficulty={difficulty}
            onDifficultyChange={setDifficulty}
            onStart={() => void handleStart()}
            starting={starting}
            hasActiveGame={hasActiveGame}
          />
        )}
        {errorMsg && (
          <Paragraph
            color="$red10"
            fontSize="$3"
            textAlign="center"
            padding="$3"
            testID="error-message"
          >
            {errorMsg}
          </Paragraph>
        )}
        <Button
          size="$3"
          chromeless
          onPress={onBack}
          alignSelf="center"
          marginBottom="$4"
          testID="back-button"
        >
          Back
        </Button>
      </YStack>
    );
  }

  // ── Result ────────────────────────────────────────────────────────────
  if (phase === 'result' && game) {
    return (
      <GameResult
        status={game.status}
        targetPlayer={game.targetPlayer}
        tokensEarned={game.tokensEarned}
        questionsUsed={game.questionsUsed}
        maxQuestions={game.maxQuestions}
        onPlayAgain={handlePlayAgain}
        onBack={onBack}
      />
    );
  }

  // ── Playing ──────────────────────────────────────────────────────────
  if (!game) return null;

  const questionsLeft = game.maxQuestions - game.questionsUsed;

  return (
    <YStack flex={1} padding="$4" gap="$3" testID="twenty-questions-playing">
      {/* Header */}
      <XStack justifyContent="space-between" alignItems="center">
        <Text fontSize="$5" fontWeight="700">
          20 Questions
        </Text>
        <Text
          fontWeight="700"
          color={questionsLeft <= 5 ? '$red10' : '$gray10'}
          fontSize="$4"
          testID="question-counter"
        >
          {game.questionsUsed} / {game.maxQuestions}
        </Text>
      </XStack>

      {errorMsg && (
        <Paragraph color="$red10" fontSize="$3" testID="error-message">
          {errorMsg}
        </Paragraph>
      )}

      {/* Question history */}
      <YStack flex={1} minHeight={100}>
        <QuestionHistory questions={game.questions} />
      </YStack>

      {/* Controls */}
      <YStack gap="$3">
        <QuestionBuilder onAsk={(p) => void handleAsk(p)} asking={asking} />

        <YStack gap="$2">
          <Text fontSize="$3" fontWeight="600" color="$gray10">
            Ready to guess?
          </Text>
          <PlayerGuess
            onGuess={(id) => void handleGuess(id)}
            guessing={guessing}
          />
        </YStack>

        <Button
          size="$3"
          theme="red"
          chromeless
          onPress={() => void handleAbandon()}
          disabled={abandoning}
          testID="abandon-button"
        >
          {abandoning ? 'Abandoning…' : 'Abandon Game'}
        </Button>
      </YStack>
    </YStack>
  );
};
