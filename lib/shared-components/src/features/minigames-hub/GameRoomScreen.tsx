/**
 * GameRoomScreen — the "Quick-play Ledger" Game Room layout (LS-8800).
 *
 * Replaces the mobile Games tab's three-card list with a denser hub:
 * header → resume banner (conditional) → All Games rows → Your Numbers →
 * coming-soon footer.
 *
 * Presentational by design: every value arrives as a prop and every tap
 * leaves through a callback, so the GraphQL wiring, analytics and expo-router
 * navigation stay in `apps/app`'s tab wrapper — the same split LS-8795 used
 * for `LeaguesLedgerScreen`. The two existing hubs (`MinigamesHub.tsx` on web,
 * `MinigamesHub.native.tsx` from LS-8669) are untouched; this is a third
 * layout over the same shared catalog, not a rewrite of either.
 *
 * Colours come from Tamagui theme tokens (`$surfaceCard`, `$fg3`, …) or, for
 * SVG props that need a raw string, `useThemeTokens()` — never inline hex
 * (`.agents/skills/ui/SKILL.md`). No `fontFamily` is set anywhere: the design
 * calls for the system font on this tab (Roboto on Android).
 */
import React from 'react';
import { ScrollView, Text, XStack, YStack } from 'tamagui';
import { GameRoomGlyph, type GameRoomGlyphName } from './GameRoomGlyphs';
import {
  compactStatFor,
  GAME_TEMPLATES,
  type MinigameCompactStat,
  type MinigameIconKind,
  type MinigameId,
  type MinigameTemplate,
  STAT_PLACEHOLDER,
} from './MinigamesHub.shared';
import { GradientSurface } from '../home/GradientSurface';
import { useThemeTokens } from '../../hooks/useThemeTokens';
import { TABULAR_NUMS } from '../../utils/typography';

export type { MinigameId } from './MinigamesHub.shared';

/** The in-progress Season Draft game the resume banner points at. */
export interface GameRoomResumeGame {
  gameId: number;
  gameName: string;
  /** 1-based round the draft is on, or null when it can't be derived. */
  round: number | null;
  totalRounds: number | null;
  /** Total managers in the game, the caller included. */
  playerCount: number | null;
}

/** The "Your Numbers" strip. Any null renders as `—`. */
export interface GameRoomPersonalStats {
  draftsWon: number | null;
  dayStreak: number | null;
  gamesPlayed: number | null;
}

export interface GameRoomScreenProps {
  /** Season Draft games in Setup or Drafting. Null while loading or on error. */
  activeGamesCount: number | null;
  /** Who Am I? best score. Null while loading or on error. */
  bestScore: number | null;
  /** 20 Questions token balance. Null while loading or on error. */
  tokens: number | null;
  /** Hidden entirely when null — the layout flows up with no gap. */
  resumeGame: GameRoomResumeGame | null;
  personalStats: GameRoomPersonalStats;
  onSelectGame: (id: MinigameId) => void;
  onResumeGame: (game: GameRoomResumeGame) => void;
}

const PAGE_PADDING = 18;
const SECTION_GAP = 18;

function glyphFor(kind: MinigameIconKind): GameRoomGlyphName {
  switch (kind) {
    case 'draft':
      return 'clipboard';
    case 'stats':
      return 'barChart';
    case 'quiz':
      return 'helpCircle';
  }
}

/**
 * `Round 3 of 9 · vs. 2 others`, dropping whichever half isn't derivable.
 *
 * The design asks for the opponents by name, but `SeasonDraftGameSummary`
 * returns every manager in the game with no marker for which one is the
 * caller, so naming them would list the user among their own opponents.
 * Counting them is the honest read of the same data; LS-8801 adds the
 * self-identification the named version needs.
 */
export function resumeStatusLine(game: GameRoomResumeGame): string | null {
  const parts: string[] = [];

  if (game.round !== null && game.totalRounds !== null) {
    parts.push(`Round ${game.round} of ${game.totalRounds}`);
  }
  if (game.playerCount !== null && game.playerCount > 1) {
    const others = game.playerCount - 1;
    parts.push(`vs. ${others} ${others === 1 ? 'other' : 'others'}`);
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}

function Eyebrow({
  children,
  color = '$fg3',
}: {
  children: string;
  color?: string;
}): React.JSX.Element {
  return (
    <Text
      fontSize={11}
      fontWeight="700"
      letterSpacing={1.6}
      textTransform="uppercase"
      color={color}
    >
      {children}
    </Text>
  );
}

/** Icon box fill / border / stroke per game accent. The stroke is a raw value
 *  because SVG has no concept of Tamagui tokens. */
function useAccentColors(accent: MinigameTemplate['accent']): {
  iconBg: string;
  iconBorder: string;
  iconColor: string;
} {
  const tokens = useThemeTokens();
  return accent === 'navy'
    ? {
        iconBg: '$accentMuted',
        iconBorder: '$focusRing',
        iconColor: tokens.semantic.infoFg,
      }
    : {
        iconBg: '$statusDangerBg',
        iconBorder: '$statusDangerBorder',
        iconColor: tokens.brand.seamRedLight,
      };
}

function StatChip({ stat }: { stat: MinigameCompactStat }): React.JSX.Element {
  return (
    <XStack
      alignItems="center"
      gap={5}
      paddingHorizontal={10}
      paddingVertical={5}
      borderRadius={9999}
      backgroundColor="$surfaceSubtle"
      borderWidth={1}
      borderColor="$glassBorder"
    >
      <Text
        fontSize={13}
        fontWeight="800"
        color={stat.tone === 'gold' ? '$brandGoldLight' : '$fg1'}
        {...TABULAR_NUMS}
      >
        {stat.value}
      </Text>
      <Text
        fontSize={10}
        fontWeight="700"
        letterSpacing={1.1}
        textTransform="uppercase"
        color="$fg3"
      >
        {stat.label}
      </Text>
    </XStack>
  );
}

function GameRow({
  template,
  stat,
  onPress,
}: {
  template: MinigameTemplate;
  stat: MinigameCompactStat;
  onPress: () => void;
}): React.JSX.Element {
  const { iconBg, iconBorder, iconColor } = useAccentColors(template.accent);
  const tokens = useThemeTokens();

  return (
    <XStack
      onPress={onPress}
      alignItems="center"
      gap={12}
      padding={12}
      borderRadius={12}
      backgroundColor="$surfaceCard"
      borderWidth={1}
      borderColor="$glassBorder"
      pressStyle={{ opacity: 0.8, borderColor: '$brandGold' }}
      testID={`games-entry-${template.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${template.title} — ${template.tag}`}
    >
      <XStack
        width={44}
        height={44}
        borderRadius={10}
        alignItems="center"
        justifyContent="center"
        backgroundColor={iconBg}
        borderWidth={1}
        borderColor={iconBorder}
      >
        <GameRoomGlyph name={glyphFor(template.iconKind)} color={iconColor} />
      </XStack>

      <YStack flex={1} gap={2}>
        <Text fontSize={15} fontWeight="700" color="$fg1">
          {template.title}
        </Text>
        <Text fontSize={12} color="$fg3" numberOfLines={1}>
          {template.tag}
        </Text>
      </YStack>

      <StatChip stat={stat} />
      <GameRoomGlyph name="chevronRight" size={18} color={tokens.text.fg4} />
    </XStack>
  );
}

function ResumeBanner({
  game,
  onPress,
}: {
  game: GameRoomResumeGame;
  onPress: () => void;
}): React.JSX.Element {
  const tokens = useThemeTokens();
  const statusLine = resumeStatusLine(game);

  return (
    <YStack
      onPress={onPress}
      borderWidth={1}
      borderColor="$brandGold"
      borderRadius={14}
      overflow="hidden"
      pressStyle={{ opacity: 0.8, borderColor: '$brandGold' }}
      testID="games-resume-banner"
      accessibilityRole="button"
      accessibilityLabel={`Resume ${game.gameName} — your turn`}
    >
      <GradientSurface
        colors={[tokens.surface.surfaceCard, tokens.surface.surfacePanel]}
        angle={135}
        flexDirection="row"
        alignItems="center"
        gap={12}
        padding={14}
      >
        <XStack
          width={44}
          height={44}
          borderRadius={9999}
          alignItems="center"
          justifyContent="center"
          backgroundColor="$statusAccentBg"
          borderWidth={1}
          borderColor="$brandGold"
        >
          <GameRoomGlyph name="play" size={20} color={tokens.brand.goldLight} />
        </XStack>

        <YStack flex={1} gap={2}>
          <Eyebrow color="$brandGoldLight">Your Turn · Season Draft</Eyebrow>
          <Text fontSize={15} fontWeight="800" color="$fg1" numberOfLines={1}>
            {game.gameName}
          </Text>
          {statusLine !== null && (
            <Text
              fontSize={12}
              color="$fg3"
              numberOfLines={1}
              {...TABULAR_NUMS}
            >
              {statusLine}
            </Text>
          )}
        </YStack>

        <Text
          fontSize={11}
          fontWeight="800"
          letterSpacing={1.2}
          textTransform="uppercase"
          color="$textOnGold"
          backgroundColor="$brandGold"
          paddingHorizontal={12}
          paddingVertical={7}
          borderRadius={9999}
        >
          Resume
        </Text>
      </GradientSurface>
    </YStack>
  );
}

function YourNumbers({
  stats,
}: {
  stats: GameRoomPersonalStats;
}): React.JSX.Element {
  const cells: Array<{ label: string; value: number | null; gold: boolean }> = [
    { label: 'Drafts Won', value: stats.draftsWon, gold: false },
    { label: 'Day Streak', value: stats.dayStreak, gold: true },
    { label: 'Games Played', value: stats.gamesPlayed, gold: false },
  ];

  return (
    <YStack gap={10} testID="games-your-numbers">
      <Eyebrow>Your Numbers</Eyebrow>
      <XStack gap={8}>
        {cells.map((cell) => (
          <YStack
            key={cell.label}
            flex={1}
            alignItems="center"
            paddingVertical={14}
            paddingHorizontal={6}
            borderRadius={12}
            backgroundColor="$surfacePanel"
            borderWidth={1}
            borderColor="$glassBorder"
          >
            <Text
              fontSize={20}
              fontWeight="800"
              color={cell.gold ? '$brandGoldLight' : '$fg1'}
              {...TABULAR_NUMS}
            >
              {cell.value !== null ? String(cell.value) : STAT_PLACEHOLDER}
            </Text>
            <Text
              fontSize={10}
              fontWeight="700"
              letterSpacing={1.2}
              textTransform="uppercase"
              color="$fg3"
              marginTop={4}
              numberOfLines={1}
            >
              {cell.label}
            </Text>
          </YStack>
        ))}
      </XStack>
    </YStack>
  );
}

export function GameRoomScreen({
  activeGamesCount,
  bestScore,
  tokens: tokenBalance,
  resumeGame,
  personalStats,
  onSelectGame,
  onResumeGame,
}: GameRoomScreenProps): React.JSX.Element {
  return (
    <ScrollView
      backgroundColor="$background"
      contentContainerStyle={{
        padding: PAGE_PADDING,
        paddingBottom: 48,
        gap: SECTION_GAP,
      }}
      testID="games-tab-screen"
    >
      <YStack gap={4}>
        <Eyebrow color="$brandGoldLight">Minigames</Eyebrow>
        <Text fontSize={24} fontWeight="900" color="$fg1">
          Game Room
        </Text>
      </YStack>

      {resumeGame !== null && (
        <ResumeBanner
          game={resumeGame}
          onPress={() => onResumeGame(resumeGame)}
        />
      )}

      <YStack gap={10}>
        <Eyebrow>All Games</Eyebrow>
        <YStack gap={8}>
          {GAME_TEMPLATES.map((template) => (
            <GameRow
              key={template.id}
              template={template}
              stat={compactStatFor(template.id, {
                activeGamesCount,
                bestScore,
                tokens: tokenBalance,
              })}
              onPress={() => onSelectGame(template.id)}
            />
          ))}
        </YStack>
      </YStack>

      <YourNumbers stats={personalStats} />

      <YStack
        gap={4}
        padding={14}
        borderRadius={12}
        backgroundColor="$surfaceSubtle"
        borderWidth={1}
        borderColor="$glassBorder"
        testID="games-coming-soon"
      >
        <Eyebrow>Coming Soon</Eyebrow>
        <Text fontSize={13} fontWeight="700" color="$fg3">
          Trade Deadline · Pennant Picks · Box Score Quiz
        </Text>
      </YStack>
    </ScrollView>
  );
}

export default GameRoomScreen;
