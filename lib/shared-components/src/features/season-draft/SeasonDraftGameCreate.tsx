import React, { useEffect, useState } from 'react';
import { LOGGER } from '@legacy-sports/logging';
import { Alert } from 'react-native';
import {
  Button,
  H1,
  Input,
  Paragraph,
  ScrollView,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { Stack } from './primitives';
import { useCreateSeasonDraftGameMutation } from '../../api/db/graphql.generated';
import { BRAND_GOLD, withAlpha } from '../../utils/colors';

interface StatDef {
  key: string;
  label: string;
  name: string;
}

const HITTER_STATS: StatDef[] = [
  { key: 'hr', label: 'HR', name: 'Home Runs' },
  { key: 'h', label: 'H', name: 'Hits' },
  { key: 'rbi', label: 'RBI', name: 'Runs Batted In' },
  { key: 'sb', label: 'SB', name: 'Stolen Bases' },
  { key: 'r', label: 'R', name: 'Runs Scored' },
  { key: 'doubles', label: '2B', name: 'Doubles' },
  { key: 'triples', label: '3B', name: 'Triples' },
  { key: 'bb', label: 'BB', name: 'Walks' },
  { key: 'tb', label: 'TB', name: 'Total Bases' },
];

const PITCHER_STATS: StatDef[] = [
  { key: 'w', label: 'W', name: 'Wins' },
  { key: 'so', label: 'SO', name: 'Strikeouts' },
  { key: 'sv', label: 'SV', name: 'Saves' },
  { key: 'sho', label: 'SHO', name: 'Shutouts' },
  { key: 'cg', label: 'CG', name: 'Complete Games' },
];

type PlayerType = 'hitter' | 'pitcher';
type GameMode = 'season' | 'career_team' | 'most_teams';

interface SeasonDraftGameCreateProps {
  onCreated: (gameId: number) => void;
  onCancel?: () => void;
}

/**
 * Season Draft Game Create
 *
 * Two-pane create form: live preview on the left, settings on the right.
 * Cross-platform Tamagui implementation.
 */
export const SeasonDraftGameCreate: React.FC<SeasonDraftGameCreateProps> = ({
  onCreated,
  onCancel,
}) => {
  const [name, setName] = useState('');
  const [playerType, setPlayerType] = useState<PlayerType>('hitter');
  const [gameMode, setGameMode] = useState<GameMode>('season');
  const [statKey, setStatKey] = useState('hr');
  const [submitting, setSubmitting] = useState(false);

  const [createGame] = useCreateSeasonDraftGameMutation();

  useEffect(() => {
    setStatKey(playerType === 'pitcher' ? 'w' : 'hr');
  }, [playerType]);

  const stats = playerType === 'pitcher' ? PITCHER_STATS : HITTER_STATS;
  const currentStat = stats.find((s) => s.key === statKey) ?? stats[0];

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a game name.');
      return;
    }
    try {
      setSubmitting(true);
      const result = await createGame({
        variables: {
          name: name.trim(),
          statKey,
          gameMode,
          playerType,
        },
      });
      const id = result.data?.createSeasonDraftGame;
      if (id) onCreated(id);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      LOGGER.error('Failed to create game', err);
      Alert.alert('Error', 'Failed to create game. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView flex={1} backgroundColor="$background">
      <YStack
        width="100%"
        maxWidth={1100}
        alignSelf="center"
        padding="$5"
        $sm={{ padding: '$3' }}
        gap="$5"
      >
        {onCancel && (
          <Button
            chromeless
            size="$2"
            alignSelf="flex-start"
            color="$textMuted"
            onPress={onCancel}
            pressStyle={{ opacity: 0.7 }}
          >
            ← Back to Lobby
          </Button>
        )}

        <XStack
          gap="$5"
          flexWrap="wrap"
          alignItems="flex-start"
          $sm={{ gap: '$3' }}
        >
          {/* ── Live Preview ── */}
          <YStack flex={1} flexBasis={320} minWidth={280} gap="$3">
            <Eyebrow color="$brandGoldLight">Live Preview</Eyebrow>
            <YStack
              backgroundColor="$surfaceCard"
              borderRadius="$4"
              borderWidth={1}
              borderColor="$surfacePanelBorder"
              padding="$4"
              gap="$3"
            >
              <Text fontSize={22} fontWeight="800" color="$color">
                {name.trim() || 'Untitled Game'}
              </Text>
              <XStack alignItems="center" gap="$3">
                <Stack
                  width={56}
                  height={56}
                  borderRadius="$3"
                  backgroundColor={withAlpha(BRAND_GOLD, 0.18)}
                  borderWidth={1}
                  borderColor={withAlpha(BRAND_GOLD, 0.4)}
                  alignItems="center"
                  justifyContent="center"
                >
                  <Text
                    fontSize={20}
                    fontWeight="800"
                    color="$brandGoldLight"
                    letterSpacing={1}
                  >
                    {currentStat.label}
                  </Text>
                </Stack>
                <YStack flex={1}>
                  <Text color="$textMuted" fontSize={11} letterSpacing={1.4}>
                    SCORE STAT
                  </Text>
                  <Text color="$color" fontWeight="700" fontSize={16}>
                    {currentStat.name}
                  </Text>
                </YStack>
              </XStack>
              <XStack
                flexWrap="wrap"
                gap="$3"
                paddingTop="$3"
                borderTopWidth={1}
                borderTopColor="$surfacePanelBorder"
              >
                <PreviewMeta label="Pool">
                  {playerType === 'pitcher' ? 'Pitchers' : 'Hitters'}
                </PreviewMeta>
                <PreviewMeta label="Mode">
                  {gameMode === 'season'
                    ? 'Season'
                    : gameMode === 'career_team'
                      ? 'Career w/ Team'
                      : 'Most Teams'}
                </PreviewMeta>
                <PreviewMeta label="Seats">Up to 6</PreviewMeta>
              </XStack>
            </YStack>
            <Paragraph color="$textMuted" fontSize={13}>
              Once you create, you'll get an invite link. Share it with up to
              five others — draft starts when everyone's in and you hit Go.
            </Paragraph>
          </YStack>

          {/* ── Settings ── */}
          <YStack
            flex={1.2}
            flexBasis={420}
            minWidth={300}
            backgroundColor="$surfaceCard"
            borderRadius="$4"
            borderWidth={1}
            borderColor="$surfacePanelBorder"
            padding="$5"
            gap="$4"
          >
            <YStack gap="$2">
              <Eyebrow>New Game · Settings</Eyebrow>
              <H1 color="$color" fontSize={32} fontWeight="800">
                Build a draft.
              </H1>
              <Paragraph color="$textMuted">
                Pick a pool, pick a stat, name it. You can tune everything else
                once players join.
              </Paragraph>
            </YStack>

            <Field label="Game Name" required helper="Required">
              <Input
                value={name}
                onChangeText={setName}
                placeholder="e.g., HR Challenge 2025"
                size="$4"
                backgroundColor="$background"
                borderColor="$surfacePanelBorder"
              />
            </Field>

            <XStack gap="$3" flexWrap="wrap">
              <YStack flex={1} flexBasis={180} minWidth={160} gap="$2">
                <Field label="Player Pool">
                  <ToggleGroup
                    options={[
                      { value: 'hitter', label: 'Hitters' },
                      { value: 'pitcher', label: 'Pitchers' },
                    ]}
                    value={playerType}
                    onChange={(v) => setPlayerType(v as PlayerType)}
                  />
                </Field>
                <Helper>Drafted players come from this pool only.</Helper>
              </YStack>
              <YStack flex={1} flexBasis={180} minWidth={160} gap="$2">
                <Field label="Game Mode">
                  <ToggleGroup
                    options={[
                      { value: 'season', label: 'Season' },
                      { value: 'career_team', label: 'Career w/ Team' },
                      { value: 'most_teams', label: 'Most Teams' },
                    ]}
                    value={gameMode}
                    onChange={(v) => setGameMode(v as GameMode)}
                  />
                </Field>
                <Helper>
                  {gameMode === 'season'
                    ? 'Pick a specific year. Stats from that one season count.'
                    : gameMode === 'career_team'
                      ? 'Pick a team. Career totals while on that team count.'
                      : 'Score is the number of distinct teams a player played for.'}
                </Helper>
              </YStack>
            </XStack>

            {gameMode !== 'most_teams' && (
              <YStack gap="$2">
                <Field label="Stat Being Drafted">
                  <XStack flexWrap="wrap" gap="$2">
                    {stats.map((s) => (
                      <StatPickerButton
                        key={s.key}
                        active={statKey === s.key}
                        onPress={() => setStatKey(s.key)}
                      >
                        {s.label}
                      </StatPickerButton>
                    ))}
                  </XStack>
                </Field>
                <Helper>
                  {currentStat.name} — the stat you'll compete on.
                </Helper>
              </YStack>
            )}

            <XStack
              gap="$2"
              justifyContent="flex-end"
              paddingTop="$3"
              borderTopWidth={1}
              borderTopColor="$surfacePanelBorder"
            >
              {onCancel && (
                <Button
                  variant="outlined"
                  borderColor="$surfacePanelBorder"
                  color="$textMuted"
                  size="$3"
                  onPress={onCancel}
                  disabled={submitting}
                >
                  Cancel
                </Button>
              )}
              <Button
                size="$4"
                backgroundColor="$brandGold"
                color="$brandNavy"
                fontWeight="800"
                onPress={() => void handleCreate()}
                disabled={!name.trim() || submitting}
                pressStyle={{ backgroundColor: '$brandGoldDark' }}
              >
                {submitting ? (
                  <XStack alignItems="center" gap="$2">
                    <Spinner size="small" color="$brandNavy" />
                    <Text color="$brandNavy" fontWeight="800">
                      Creating…
                    </Text>
                  </XStack>
                ) : (
                  'Create Game →'
                )}
              </Button>
            </XStack>
          </YStack>
        </XStack>
      </YStack>
    </ScrollView>
  );
};

// ── Helpers ─────────────────────────────────────────────────────────────────

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

function Field({
  label,
  helper,
  required,
  children,
}: {
  label: string;
  helper?: string;
  required?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <YStack gap="$2">
      <XStack alignItems="center" gap="$2">
        <Text
          fontSize={11}
          color="$textMuted"
          letterSpacing={1.4}
          textTransform="uppercase"
          fontWeight="700"
        >
          {label}
        </Text>
        {required && (
          <Text fontSize={10} color="$brandSeamRedLight" fontWeight="700">
            {helper ?? 'Required'}
          </Text>
        )}
      </XStack>
      {children}
    </YStack>
  );
}

function Helper({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Text fontSize={12} color="$textMuted" fontStyle="italic">
      {children}
    </Text>
  );
}

function PreviewMeta({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <YStack gap="$1" minWidth={80}>
      <Text
        fontSize={10}
        color="$textMuted"
        letterSpacing={1.4}
        textTransform="uppercase"
      >
        {label}
      </Text>
      <Text color="$color" fontWeight="700">
        {children}
      </Text>
    </YStack>
  );
}

function ToggleGroup({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (next: string) => void;
}): React.JSX.Element {
  return (
    <XStack
      borderWidth={1}
      borderColor="$surfacePanelBorder"
      borderRadius="$3"
      overflow="hidden"
      flexWrap="wrap"
    >
      {options.map((o, i) => {
        const active = value === o.value;
        return (
          <Button
            key={o.value}
            chromeless
            flex={1}
            size="$3"
            backgroundColor={active ? '$brandGold' : 'transparent'}
            color={active ? '$brandNavy' : '$color'}
            fontWeight={active ? '800' : '600'}
            borderRadius={0}
            borderLeftWidth={i === 0 ? 0 : 1}
            borderLeftColor="$surfacePanelBorder"
            onPress={() => onChange(o.value)}
            hoverStyle={{
              backgroundColor: active ? '$brandGoldDark' : '$backgroundHover',
            }}
          >
            {o.label}
          </Button>
        );
      })}
    </XStack>
  );
}

function StatPickerButton({
  active,
  onPress,
  children,
}: {
  active: boolean;
  onPress: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Button
      size="$3"
      backgroundColor={active ? '$brandGold' : 'transparent'}
      color={active ? '$brandNavy' : '$color'}
      borderWidth={1}
      borderColor={active ? '$brandGold' : '$surfacePanelBorder'}
      fontWeight="800"
      letterSpacing={1}
      onPress={onPress}
      hoverStyle={{ borderColor: '$brandGoldLight' }}
    >
      {children}
    </Button>
  );
}

export default SeasonDraftGameCreate;
