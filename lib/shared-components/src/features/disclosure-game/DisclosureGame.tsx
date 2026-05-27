import React, { useEffect, useState } from 'react';
import {
  Button,
  H1,
  Input,
  Paragraph,
  ScrollView,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { Circle, Stack } from '../season-draft/primitives';
import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_SEAM_RED,
  BRAND_SEAM_RED_LIGHT,
  withAlpha,
} from '../../utils/colors';
import {
  useActiveDisclosureGameLazyQuery,
  useGiveUpDisclosureGameMutation,
  useNextClueMutation,
  useSearchPlayersForDisclosureLazyQuery,
  useStartDisclosureGameMutation,
  useSubmitGuessMutation,
} from '../../api/db/graphql.generated';

/**
 * Progressive Disclosure Minigame — "Who Am I?"
 *
 * A guessing game where baseball player facts are revealed one at a time.
 * Fewer clues used = higher score.
 *
 * Phases: idle → playing → result.
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

// ── Tier styling ───────────────────────────────────────────────────────────

const TIER_STYLES: Record<
  string,
  { bg: string; color: string; label: string }
> = {
  vague: {
    bg: withAlpha('#5B84C4', 0.18),
    color: '#8FB4E8',
    label: 'Cold',
  },
  cold: {
    bg: withAlpha('#5B84C4', 0.18),
    color: '#8FB4E8',
    label: 'Cold',
  },
  moderate: {
    bg: withAlpha('#C89452', 0.18),
    color: '#E3B870',
    label: 'Warm',
  },
  warm: {
    bg: withAlpha('#C89452', 0.18),
    color: '#E3B870',
    label: 'Warm',
  },
  hot: {
    bg: withAlpha(BRAND_SEAM_RED, 0.18),
    color: BRAND_SEAM_RED_LIGHT,
    label: 'Hot',
  },
  scorching: {
    bg: withAlpha(BRAND_SEAM_RED, 0.3),
    color: '#FFFFFF',
    label: 'Scorching',
  },
};

function tierStyle(tier: string) {
  return TIER_STYLES[tier.toLowerCase()] ?? TIER_STYLES.vague;
}

// ── Small presentational helpers ───────────────────────────────────────────

function Eyebrow({
  children,
  color = '$textMuted',
}: {
  children: React.ReactNode;
  color?: string;
}): React.JSX.Element {
  return (
    <Text
      fontSize={11}
      letterSpacing={1.6}
      textTransform="uppercase"
      color={color}
      fontWeight="700"
    >
      {children}
    </Text>
  );
}

function BackButton({
  onPress,
  label,
}: {
  onPress: () => void;
  label: string;
}): React.JSX.Element {
  return (
    <Button
      chromeless
      size="$2"
      alignSelf="flex-start"
      color="$textMuted"
      onPress={onPress}
      pressStyle={{ opacity: 0.7 }}
      testID="back-button"
    >
      {`← ${label}`}
    </Button>
  );
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

  // ── Resume state ───────────────────────────────────────────────────────
  // When the user navigates away mid-game and returns, we surface their
  // in-progress session as a Resume CTA on the idle screen rather than
  // silently abandoning it and starting a fresh round.
  const [resumable, setResumable] = useState<{
    sessionId: number;
    totalClues: number;
    revealedClues: Clue[];
    isLastClue: boolean;
  } | null>(null);

  // ── GraphQL hooks ──────────────────────────────────────────────────────
  const [fetchActiveGame, { loading: checkingActive }] =
    useActiveDisclosureGameLazyQuery({ fetchPolicy: 'network-only' });
  const [startGame, { loading: starting }] = useStartDisclosureGameMutation();
  const [revealClue, { loading: revealing }] = useNextClueMutation();
  const [guess, { loading: guessing }] = useSubmitGuessMutation();
  const [giveUp, { loading: givingUp }] = useGiveUpDisclosureGameMutation();
  const [searchPlayers, { loading: searching }] =
    useSearchPlayersForDisclosureLazyQuery();

  // On mount, check for an in-progress session so the user can resume.
  useEffect(() => {
    void (async () => {
      const { data } = await fetchActiveGame();
      const active = data?.activeDisclosureGame;
      if (
        !active ||
        active.id == null ||
        active.cluesRevealed == null ||
        active.totalClues == null ||
        active.cluesRevealed >= active.totalClues
      ) {
        return;
      }
      const totalClues = active.totalClues;
      const revealed: Clue[] = (active.revealedClues ?? []).flatMap((c) => {
        if (c.clueText == null || c.clueIndex == null) return [];
        return [
          {
            clueText: c.clueText,
            difficultyTier: c.difficultyTier ?? 'vague',
            clueIndex: c.clueIndex,
          },
        ];
      });
      setResumable({
        sessionId: active.id,
        totalClues,
        revealedClues: revealed,
        isLastClue: revealed.some((c) => c.clueIndex === totalClues),
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleStart = async () => {
    setErrorMsg(null);
    // User explicitly chose to start a new game — drop any resumable session.
    setResumable(null);
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

  const handleResume = () => {
    if (!resumable) return;
    setErrorMsg(null);
    setSessionId(resumable.sessionId);
    setTotalClues(resumable.totalClues);
    setRevealedClues(resumable.revealedClues);
    setIsLastClue(resumable.isLastClue);
    setGuessText('');
    setSuggestions([]);
    setSelectedPlayer(null);
    setResult(null);
    setResumable(null);
    setPhase('playing');
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

  // ── Render: Idle ───────────────────────────────────────────────────────

  if (phase === 'idle') {
    return (
      <ScrollView flex={1} backgroundColor="$background">
        <YStack
          width="100%"
          maxWidth={720}
          alignSelf="center"
          padding="$5"
          gap="$4"
          testID="disclosure-game-idle"
        >
          <BackButton onPress={onBack} label="Back to Games" />
          <YStack
            alignItems="center"
            gap="$4"
            padding="$6"
            backgroundColor="$surfaceCard"
            borderRadius="$6"
            borderWidth={1}
            borderColor={withAlpha(BRAND_SEAM_RED, 0.3)}
          >
            <Circle
              size={104}
              borderWidth={2}
              borderStyle="dashed"
              borderColor={withAlpha(BRAND_SEAM_RED, 0.4)}
              backgroundColor={withAlpha(BRAND_SEAM_RED, 0.1)}
            >
              <Text fontSize={72} fontWeight="800" color={BRAND_SEAM_RED_LIGHT}>
                ?
              </Text>
            </Circle>
            <Eyebrow color={BRAND_SEAM_RED_LIGHT}>Solo · Trivia</Eyebrow>
            <H1
              color="$color"
              fontSize={48}
              lineHeight={48}
              letterSpacing={-1}
              fontWeight="800"
              textAlign="center"
            >
              Who Am I?
            </H1>
            <Paragraph
              color="$textMuted"
              textAlign="center"
              maxWidth={420}
              fontSize={17}
            >
              Seven clues. One player from the record book. Guess early for a
              bigger score — but guess wrong and you keep revealing.
            </Paragraph>
            <XStack
              gap="$2"
              flexWrap="wrap"
              justifyContent="center"
              width="100%"
            >
              <RuleCard num="01" text="Reveal a clue" />
              <RuleCard num="02" text="Guess (or reveal another)" />
              <RuleCard num="03" text="Fewer clues = higher score" />
            </XStack>
            {resumable && (
              <Stack
                width="100%"
                padding="$4"
                gap="$2"
                backgroundColor={withAlpha(BRAND_GOLD, 0.08)}
                borderWidth={1}
                borderColor={withAlpha(BRAND_GOLD, 0.4)}
                borderRadius="$4"
                testID="resume-game-banner"
              >
                <Eyebrow color={BRAND_GOLD_LIGHT}>Game In Progress</Eyebrow>
                <Paragraph color="$color" fontSize={15}>
                  You have an active round with {resumable.revealedClues.length}{' '}
                  of {resumable.totalClues} clue
                  {resumable.totalClues === 1 ? '' : 's'} revealed.
                </Paragraph>
              </Stack>
            )}
            <XStack
              gap="$3"
              marginTop="$3"
              flexWrap="wrap"
              justifyContent="center"
            >
              {resumable && (
                <Button
                  size="$5"
                  backgroundColor="$brandGold"
                  color="$brandNavy"
                  fontWeight="800"
                  onPress={handleResume}
                  pressStyle={{ backgroundColor: '$brandGoldDark' }}
                  testID="resume-game-button"
                >
                  Resume Game
                </Button>
              )}
              <Button
                size="$5"
                backgroundColor={resumable ? '$surfacePanel' : '$brandGold'}
                color={resumable ? '$color' : '$brandNavy'}
                fontWeight="800"
                onPress={() => void handleStart()}
                disabled={starting || checkingActive}
                pressStyle={{
                  backgroundColor: resumable
                    ? '$surfacePanel'
                    : '$brandGoldDark',
                }}
                variant={resumable ? 'outlined' : undefined}
                borderColor={resumable ? '$surfacePanelBorder' : undefined}
                testID="start-game-button"
              >
                {starting
                  ? 'Starting…'
                  : resumable
                    ? 'Start New Game'
                    : checkingActive
                      ? 'Checking…'
                      : 'Start Game'}
              </Button>
              <Button
                size="$5"
                variant="outlined"
                borderColor="$surfacePanelBorder"
                color="$color"
                onPress={onBack}
              >
                Not Now
              </Button>
            </XStack>
          </YStack>
        </YStack>
      </ScrollView>
    );
  }

  // ── Render: Result ─────────────────────────────────────────────────────

  if (phase === 'result' && result) {
    const won = result.outcome === 'won';
    const givenUp = result.outcome === 'given_up';
    const accent = won
      ? withAlpha(BRAND_GOLD, 0.5)
      : givenUp
        ? '$surfacePanelBorder'
        : withAlpha(BRAND_SEAM_RED, 0.4);
    const headline = won
      ? 'Correct.'
      : givenUp
        ? 'Flag raised.'
        : 'Out of clues.';
    const sub = won
      ? 'You named them.'
      : givenUp
        ? 'Better luck next clue.'
        : 'The record book keeps its secret.';

    return (
      <ScrollView flex={1} backgroundColor="$background">
        <YStack
          width="100%"
          maxWidth={680}
          alignSelf="center"
          padding="$5"
          gap="$4"
          testID="disclosure-game-result"
        >
          <BackButton onPress={onBack} label="Back to Games" />
          <YStack
            alignItems="center"
            gap="$3"
            padding="$6"
            backgroundColor="$surfaceCard"
            borderRadius="$6"
            borderWidth={1}
            borderColor={accent}
          >
            <Text
              fontSize={64}
              fontWeight="800"
              testID="result-emoji"
              role="img"
              aria-label={
                won ? 'trophy' : givenUp ? 'white flag' : 'cross mark'
              }
              color={
                won
                  ? '$brandGoldLight'
                  : givenUp
                    ? '$textMuted'
                    : '$brandSeamRedLight'
              }
            >
              {won ? '\u{1F3C6}' : givenUp ? '⚑' : '✕'}
            </Text>
            <Eyebrow color="$textMuted">{sub}</Eyebrow>
            <H1
              fontSize={48}
              lineHeight={48}
              letterSpacing={-1}
              fontWeight="800"
              color="$color"
              testID="result-headline"
              textAlign="center"
            >
              {headline}
            </H1>

            {won && (
              <YStack alignItems="center" gap="$1" marginVertical="$3">
                <Text
                  fontSize={96}
                  lineHeight={96}
                  fontWeight="800"
                  color="$brandGoldLight"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                  testID="result-score"
                >
                  {result.score}
                </Text>
                <Eyebrow color="$textMuted">Points</Eyebrow>
              </YStack>
            )}

            {(result.correctPlayerName || result.correctPlayerId) && (
              <Stack
                width="100%"
                padding="$4"
                marginVertical="$2"
                backgroundColor={withAlpha('#ffffff', 0.03)}
                borderWidth={1}
                borderColor="$surfacePanelBorder"
                borderRadius="$4"
              >
                <Eyebrow color="$textMuted">The Player</Eyebrow>
                <Paragraph
                  fontFamily="$body"
                  fontStyle="italic"
                  fontSize={28}
                  lineHeight={32}
                  color="$color"
                  marginTop="$2"
                  testID="result-correct-player"
                >
                  {result.correctPlayerName ||
                    `Player #${String(result.correctPlayerId)}`}
                </Paragraph>
              </Stack>
            )}

            <XStack gap="$2" width="100%" marginTop="$2">
              <StatTile value={String(result.cluesUsed)} label="Clues Used" />
              <StatTile
                value={String(Math.max(0, totalClues - result.cluesUsed))}
                label="Unseen"
              />
              <StatTile value={won ? 'Yes' : 'No'} label="Correct" />
            </XStack>

            <Paragraph
              color="$textMuted"
              fontSize={13}
              testID="result-clues-used"
              marginTop="$2"
            >
              Clues used: {result.cluesUsed} / {totalClues}
            </Paragraph>

            <XStack
              gap="$3"
              marginTop="$3"
              flexWrap="wrap"
              justifyContent="center"
            >
              <Button
                size="$5"
                backgroundColor="$brandGold"
                color="$brandNavy"
                fontWeight="800"
                onPress={handlePlayAgain}
                pressStyle={{ backgroundColor: '$brandGoldDark' }}
                testID="play-again-button"
              >
                Play Again
              </Button>
              <Button
                size="$5"
                variant="outlined"
                borderColor="$surfacePanelBorder"
                color="$color"
                onPress={onBack}
              >
                Back to Games
              </Button>
            </XStack>
          </YStack>
        </YStack>
      </ScrollView>
    );
  }

  // ── Render: Playing ────────────────────────────────────────────────────

  const canReveal = revealedClues.length < totalClues && !isLastClue;
  const hasRevealedAny = revealedClues.length > 0;

  return (
    <ScrollView flex={1} backgroundColor="$background">
      <YStack
        width="100%"
        maxWidth={1180}
        alignSelf="center"
        padding="$5"
        gap="$4"
        testID="disclosure-game-playing"
      >
        <BackButton onPress={onBack} label="Back to Games" />

        {/* Header */}
        <XStack
          justifyContent="space-between"
          alignItems="center"
          gap="$4"
          padding="$4"
          backgroundColor="$surfaceCard"
          borderRadius="$5"
          borderWidth={1}
          borderColor="$surfacePanelBorder"
          flexWrap="wrap"
        >
          <YStack gap="$1">
            <Eyebrow color={BRAND_SEAM_RED_LIGHT}>● Session Live</Eyebrow>
            <H1
              fontSize={32}
              lineHeight={32}
              letterSpacing={-0.5}
              fontWeight="800"
              color="$color"
            >
              Who Am I?
            </H1>
          </YStack>
          <YStack alignItems="flex-end" gap="$1">
            <XStack alignItems="baseline" gap="$1" testID="clue-counter">
              <Text
                fontSize={40}
                lineHeight={40}
                fontWeight="800"
                color="$brandGoldLight"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {revealedClues.length}
              </Text>
              <Text
                fontSize={22}
                color="$textMuted"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {` / ${totalClues}`}
              </Text>
            </XStack>
            <Eyebrow color="$textMuted">Clues</Eyebrow>
            <XStack gap="$1" marginTop="$1">
              {Array.from({ length: totalClues }).map((_, i) => (
                <Stack
                  key={i}
                  width={22}
                  height={6}
                  borderRadius={2}
                  backgroundColor={
                    i < revealedClues.length
                      ? '$brandGold'
                      : '$surfacePanelBorder'
                  }
                />
              ))}
            </XStack>
          </YStack>
        </XStack>

        {/* Error banner */}
        {errorMsg && (
          <Stack
            padding="$3"
            borderRadius="$3"
            backgroundColor={withAlpha(BRAND_SEAM_RED, 0.12)}
            borderWidth={1}
            borderColor={withAlpha(BRAND_SEAM_RED, 0.4)}
          >
            <Text
              color={BRAND_SEAM_RED_LIGHT}
              fontSize={14}
              testID="error-message"
            >
              ✕ {errorMsg}
            </Text>
          </Stack>
        )}

        {/* Main grid: feed + side */}
        <XStack gap="$4" flexWrap="wrap" alignItems="flex-start">
          {/* Clue feed */}
          <YStack
            flex={1}
            flexBasis={420}
            minWidth={280}
            gap="$3"
            padding="$4"
            backgroundColor="$surfaceCard"
            borderRadius="$5"
            borderWidth={1}
            borderColor="$surfacePanelBorder"
            minHeight={460}
          >
            {!hasRevealedAny ? (
              <YStack
                flex={1}
                alignItems="center"
                justifyContent="center"
                gap="$2"
                padding="$5"
              >
                <Circle
                  size={80}
                  borderWidth={2}
                  borderStyle="dashed"
                  borderColor="$surfacePanelBorder"
                >
                  <Text fontSize={48} fontWeight="800" color="$textMuted">
                    ?
                  </Text>
                </Circle>
                <Text
                  fontSize={20}
                  fontWeight="700"
                  color="$textMuted"
                  marginTop="$3"
                >
                  Reveal the first clue to begin.
                </Text>
                <Paragraph color="$textMuted" fontSize={14} textAlign="center">
                  You'll get up to {totalClues} clues. Fewer clues used, higher
                  your score.
                </Paragraph>
              </YStack>
            ) : (
              <YStack gap="$3">
                {revealedClues.map((clue) => {
                  const t = tierStyle(clue.difficultyTier);
                  return (
                    <Stack
                      key={clue.clueIndex}
                      padding="$4"
                      borderRadius="$4"
                      backgroundColor={withAlpha('#1B3A5C', 0.18)}
                      borderWidth={1}
                      borderColor="$surfacePanelBorder"
                      testID={`clue-${clue.clueIndex}`}
                    >
                      <XStack alignItems="center" gap="$2" marginBottom="$2">
                        <Text
                          fontSize={11}
                          fontWeight="800"
                          letterSpacing={1.4}
                          textTransform="uppercase"
                          color="$brandGoldLight"
                        >
                          Clue {String(clue.clueIndex).padStart(2, '0')}
                        </Text>
                        <Stack
                          paddingHorizontal={8}
                          paddingVertical={3}
                          borderRadius={4}
                          backgroundColor={t.bg}
                        >
                          <Text
                            fontSize={10}
                            fontWeight="700"
                            letterSpacing={1.2}
                            textTransform="uppercase"
                            color={t.color}
                          >
                            {t.label}
                          </Text>
                        </Stack>
                      </XStack>
                      <Paragraph fontSize={16} lineHeight={26} color="$color">
                        {clue.clueText}
                      </Paragraph>
                    </Stack>
                  );
                })}
              </YStack>
            )}
          </YStack>

          {/* Side panel */}
          <YStack flex={0} flexBasis={320} minWidth={280} gap="$3">
            {/* Next clue */}
            <YStack
              padding="$4"
              gap="$2"
              backgroundColor="$surfaceCard"
              borderRadius="$5"
              borderWidth={1}
              borderColor="$surfacePanelBorder"
            >
              <Eyebrow>Next Step</Eyebrow>
              {canReveal ? (
                <Button
                  size="$4"
                  variant="outlined"
                  borderColor="$surfacePanelBorder"
                  color="$color"
                  onPress={() => void handleNextClue()}
                  disabled={revealing}
                  testID="next-clue-button"
                >
                  {revealing ? 'Revealing…' : 'Reveal Next Clue ↓'}
                </Button>
              ) : (
                <Text fontSize={13} color="$textMuted">
                  All clues revealed — submit your guess or give up.
                </Text>
              )}
            </YStack>

            {/* Guess input */}
            {hasRevealedAny && (
              <YStack
                padding="$4"
                gap="$2"
                backgroundColor="$surfaceCard"
                borderRadius="$5"
                borderWidth={1}
                borderColor="$surfacePanelBorder"
              >
                <Eyebrow>Your Guess</Eyebrow>
                <Input
                  size="$4"
                  placeholder="Type player name…"
                  value={guessText}
                  onChangeText={(text: string) => void handleGuessInput(text)}
                  testID="guess-input"
                />
                {suggestions.length > 0 && (
                  <YStack
                    backgroundColor="$background"
                    borderWidth={1}
                    borderColor="$surfacePanelBorder"
                    borderRadius="$3"
                    overflow="hidden"
                    testID="player-suggestions"
                  >
                    {suggestions.map((p) => (
                      <XStack
                        key={p.id}
                        paddingHorizontal="$3"
                        paddingVertical="$2.5"
                        alignItems="center"
                        gap="$2"
                        pressStyle={{
                          backgroundColor: withAlpha('#1B3A5C', 0.3),
                        }}
                        onPress={() => handleSelectSuggestion(p)}
                        testID={`suggestion-${p.id}`}
                        cursor="pointer"
                      >
                        <Circle size={6} backgroundColor="$brandSeamRed" />
                        <Text fontSize={14} color="$color">
                          {p.firstName} {p.lastName}
                        </Text>
                      </XStack>
                    ))}
                  </YStack>
                )}
                {searching && (
                  <Text color="$textMuted" fontSize={12}>
                    Searching…
                  </Text>
                )}
                <Button
                  size="$4"
                  backgroundColor="$brandGold"
                  color="$brandNavy"
                  fontWeight="800"
                  onPress={() => void handleSubmitGuess()}
                  disabled={!selectedPlayer || guessing}
                  pressStyle={{ backgroundColor: '$brandGoldDark' }}
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
                variant="outlined"
                borderColor={withAlpha(BRAND_SEAM_RED, 0.4)}
                color={BRAND_SEAM_RED_LIGHT}
                onPress={() => void handleGiveUp()}
                disabled={givingUp}
                testID="give-up-button"
              >
                {givingUp ? 'Giving up…' : '⚑ Give Up'}
              </Button>
            )}

            {/* Scoring tip */}
            <YStack
              padding="$4"
              gap="$2"
              backgroundColor={withAlpha(BRAND_GOLD, 0.05)}
              borderWidth={1}
              borderStyle="dashed"
              borderColor={withAlpha(BRAND_GOLD, 0.25)}
              borderRadius="$4"
            >
              <Eyebrow color="$brandGoldLight">Scoring</Eyebrow>
              <ScoringRow label="1 clue" value="100 pts" />
              <ScoringRow label="2–3 clues" value="70–85 pts" />
              <ScoringRow label="4–5 clues" value="40–55 pts" />
              <ScoringRow label="6–7 clues" value="15–25 pts" />
            </YStack>
          </YStack>
        </XStack>
      </YStack>
    </ScrollView>
  );
};

// ── Small subcomponents ────────────────────────────────────────────────────

function RuleCard({
  num,
  text,
}: {
  num: string;
  text: string;
}): React.JSX.Element {
  return (
    <YStack
      flex={1}
      flexBasis={140}
      padding="$3"
      backgroundColor={withAlpha('#ffffff', 0.03)}
      borderWidth={1}
      borderColor="$surfacePanelBorder"
      borderRadius="$3"
    >
      <Text
        fontSize={24}
        fontWeight="800"
        color={BRAND_GOLD_LIGHT}
        letterSpacing={0.4}
      >
        {num}
      </Text>
      <Text fontSize={13} color="$textMuted" marginTop="$1">
        {text}
      </Text>
    </YStack>
  );
}

function StatTile({
  value,
  label,
}: {
  value: string;
  label: string;
}): React.JSX.Element {
  return (
    <YStack
      flex={1}
      padding="$3"
      alignItems="center"
      backgroundColor={withAlpha('#ffffff', 0.03)}
      borderWidth={1}
      borderColor="$surfacePanelBorder"
      borderRadius="$3"
    >
      <Text
        fontSize={24}
        fontWeight="800"
        color="$color"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </Text>
      <Eyebrow color="$textMuted">{label}</Eyebrow>
    </YStack>
  );
}

function ScoringRow({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.JSX.Element {
  return (
    <XStack justifyContent="space-between" alignItems="center">
      <Text fontSize={13} color="$textMuted">
        {label}
      </Text>
      <Text
        fontSize={13}
        fontWeight="800"
        color="$brandGoldLight"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </Text>
    </XStack>
  );
}
