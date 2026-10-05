/**
 * MinigamesHub — a single breakpoint-driven component shared by web and
 * native (LS-9058).
 *
 * Previously forked into `MinigamesHub.tsx` (web) and `MinigamesHub.native.tsx`
 * (LS-8669) because the web version was written directly in raw HTML/SVG
 * host tags (`<div>`/`<span>`/`<svg>`), which crash React Native with "View
 * config getter callback for component `div` must be a function" — RN has no
 * view config for lowercase host tags. That crash was a real capability gap,
 * but it only applied to the raw-DOM/raw-SVG pieces, not the whole 800-line
 * layout: the fix is to build the layout once in Tamagui (which compiles to
 * both react-native-web and RN) and isolate the two genuinely irreducible
 * pieces — the decorative baseball artwork and the icon glyph set — behind
 * narrow `.native.tsx` shims, matching the repo's established pattern for
 * raw-SVG art (`SportGlyph.tsx`, `GameRoomGlyphs.tsx`).
 *
 * Colors come from Tamagui theme tokens (`$surfaceCard`, `$textMuted`, …) or,
 * for `react-native-svg`/raw-string props, `useThemeTokens()` — never inline
 * hex — so the hub renders correctly in both light and dark themes
 * (`.agents/skills/ui/SKILL.md`).
 */
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { ScrollView, Text, XStack, YStack } from 'tamagui';
import {
  SeasonDraftGameStatus,
  useGetDisclosureGameBestScoreQuery,
  useGetMinigamesStatsQuery,
  useGetMyMockDraftUsageQuery,
  useGetSeasonDraftGamesQuery,
} from '@legacy-sports/graphql';
import { LOGGER } from '@legacy-sports/logging';
import {
  GAME_TEMPLATES,
  type MinigamesHubProps,
  type MinigameStat,
  type MinigameTemplate,
  statFor,
} from './MinigamesHub.shared';
import { GameRoomGlyph } from './GameRoomGlyphs';
import { MinigamesHubBaseballMark } from './MinigamesHubBaseballMark';
import { useThemeTokens } from '../../hooks/useThemeTokens';
import { FONT_BODY, FONT_DISPLAY, TABULAR_NUMS } from '../../utils/typography';
import { BRAND_GOLD, BRAND_NAVY, withAlpha } from '../../utils/colors';

// Layered radial/linear wash matching the hero background in the
// legacy-baseball-minigames mockup (docs/design/.../styles-hub.css
// `.hub-hero`). Web-only — React Native has no `backgroundImage` — painted
// over the `$surfaceCard` backgroundColor set on the hero stack (LS-9131).
const HERO_BACKGROUND_IMAGE = [
  `radial-gradient(ellipse at 85% 30%, ${withAlpha(BRAND_GOLD, 0.12)} 0%, transparent 55%)`,
  `linear-gradient(135deg, ${withAlpha(BRAND_NAVY, 0.45)} 0%, ${withAlpha(BRAND_NAVY, 0.3)} 50%, transparent 100%)`,
].join(', ');
// Matches design-tokens' `shadowsDark.lg` / `shadowsLight.lg` recipe, applied
// via RN-style shadow props (SearchBar.tsx's `$shadowColor`-token pattern)
// rather than a raw rgba string, since this component renders on native too.
const SHADOW_LG = {
  shadowColor: '$shadowColor',
  shadowOpacity: 1,
  shadowOffset: { width: 0, height: 12 },
  shadowRadius: 32,
} as const;

export type { MinigameId, MinigamesHubProps } from './MinigamesHub.shared';

type Accent = MinigameTemplate['accent'];

type GameDef = MinigameTemplate & { stat: MinigameStat };

// Narrow-viewport breakpoint: at <=720px the hero stacks and cards become
// single-column so copy and CTAs remain readable/tappable on phones. Native
// callers pass `isNarrow` explicitly (from `useWindowDimensions`) instead —
// see the `isNarrow` prop override below.
const NARROW_QUERY = '(max-width: 720px)';

function useIsNarrow(): boolean {
  const [narrow, setNarrow] = React.useState(false);
  React.useEffect(() => {
    if (typeof document === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(NARROW_QUERY);
    setNarrow(mq.matches);
    const handler = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return narrow;
}

/** Icon box / border / stroke colors per game accent. Icon strokes are raw
 *  values (react-native-svg has no concept of Tamagui tokens); everything
 *  else stays as a `$token` for the caller to apply directly. */
function useAccentColors(accent: Accent): {
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

function glyphFor(
  kind: MinigameTemplate['iconKind'],
): 'clipboard' | 'barChart' {
  return kind === 'draft' || kind === 'mockDraft' ? 'clipboard' : 'barChart';
}

const GameCard: React.FC<{
  game: GameDef;
  onPress: () => void;
  isNarrow: boolean;
}> = ({ game, onPress, isNarrow }) => {
  const { iconBg, iconBorder, iconColor } = useAccentColors(game.accent);
  const tokens = useThemeTokens();

  return (
    <YStack
      role="button"
      tabIndex={0}
      onPress={onPress}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPress();
        }
      }}
      cursor="pointer"
      animation="quick"
      flex={isNarrow ? undefined : 1}
      minWidth={isNarrow ? '100%' : 280}
      backgroundColor="$surfaceCard"
      borderWidth={1}
      borderColor="$glassBorder"
      borderRadius={16}
      padding={isNarrow ? 20 : 24}
      gap={14}
      hoverStyle={{
        borderColor: '$brandGold',
        y: -4,
        ...SHADOW_LG,
      }}
      pressStyle={{ opacity: 0.9 }}
    >
      <XStack alignItems="center" justifyContent="space-between" gap={12}>
        <XStack
          width={52}
          height={52}
          borderRadius={12}
          alignItems="center"
          justifyContent="center"
          backgroundColor={iconBg}
          borderWidth={1}
          borderColor={iconBorder}
        >
          <GameRoomGlyph
            name={glyphFor(game.iconKind)}
            size={26}
            color={iconColor}
          />
        </XStack>
        <Text
          fontFamily={FONT_DISPLAY}
          fontWeight="700"
          fontSize={isNarrow ? 11.5 : 10.5}
          letterSpacing={isNarrow ? 1.38 : 1.26}
          textTransform="uppercase"
          color="$textMuted"
          paddingHorizontal={11}
          paddingVertical={6}
          borderRadius={9999}
          backgroundColor="$surfaceSubtle"
          borderWidth={1}
          borderColor="$glassBorder"
        >
          {game.tag}
        </Text>
      </XStack>

      <Text
        fontFamily={FONT_DISPLAY}
        fontWeight="800"
        fontSize={isNarrow ? 34 : 40}
        lineHeight={isNarrow ? 36 : 42}
        letterSpacing={isNarrow ? -0.68 : -0.88}
        color="$fg1"
      >
        {game.title}
      </Text>

      <Text
        fontFamily={FONT_BODY}
        fontSize={isNarrow ? 15.5 : 15}
        lineHeight={22}
        color="$textMuted"
      >
        {game.desc}
      </Text>

      <YStack gap={isNarrow ? 8 : 6}>
        {game.meta.map((m) => (
          <XStack key={m} alignItems="flex-start" gap={8}>
            <YStack
              width={8}
              height={1}
              marginTop={9}
              backgroundColor="$brandGold"
            />
            <Text flex={1} fontSize={isNarrow ? 14 : 13} color="$textMuted">
              {m}
            </Text>
          </XStack>
        ))}
      </YStack>

      <XStack
        alignItems="center"
        justifyContent="space-between"
        gap={12}
        paddingTop={16}
        borderTopWidth={1}
        borderStyle="dashed"
        borderColor="$outlineSubtle"
      >
        <YStack>
          <Text
            fontFamily={FONT_DISPLAY}
            fontWeight="800"
            fontSize={26}
            color="$brandGoldLight"
            {...TABULAR_NUMS}
          >
            {game.stat.value}
          </Text>
          <Text
            fontFamily={FONT_DISPLAY}
            fontWeight="700"
            fontSize={isNarrow ? 11 : 10}
            letterSpacing={isNarrow ? 1.54 : 1.4}
            textTransform="uppercase"
            color="$textMuted"
            marginTop={4}
          >
            {game.stat.label}
          </Text>
          {game.stat.note ? (
            <Text
              fontSize={isNarrow ? 12 : 11}
              color="$textMuted"
              marginTop={4}
              testID={`minigame-stat-note-${game.id}`}
            >
              {game.stat.note}
            </Text>
          ) : null}
        </YStack>
        <XStack
          alignItems="center"
          gap={8}
          paddingHorizontal={isNarrow ? 18 : 16}
          paddingVertical={isNarrow ? 12 : 10}
          borderRadius={9999}
          backgroundColor="$statusAccentBg"
          borderWidth={1}
          borderColor="$statusAccentBorder"
        >
          <Text
            fontFamily={FONT_DISPLAY}
            fontWeight="800"
            fontSize={isNarrow ? 14 : 13}
            letterSpacing={isNarrow ? 1.4 : 1.3}
            textTransform="uppercase"
            color="$brandGoldLight"
          >
            {game.cta}
          </Text>
          <GameRoomGlyph
            name="arrowRight"
            size={16}
            strokeWidth={2}
            color={tokens.brand.goldLight}
          />
        </XStack>
      </XStack>
    </YStack>
  );
};

export function MinigamesHub({
  onNavigate,
  isNarrow: isNarrowProp,
  banner,
}: MinigamesHubProps): React.JSX.Element {
  const isNarrowHook = useIsNarrow();
  const isNarrow = isNarrowProp ?? isNarrowHook;

  const {
    data: sdGamesData,
    loading: sdLoading,
    error: sdError,
  } = useGetSeasonDraftGamesQuery();
  const { data: bestScoreData, error: bestScoreError } =
    useGetDisclosureGameBestScoreQuery();
  const { data: minigamesStatsData, error: minigamesStatsError } =
    useGetMinigamesStatsQuery();
  const { data: mockDraftUsageData, error: mockDraftUsageError } =
    useGetMyMockDraftUsageQuery();

  // Errors are non-fatal — the UI falls back to '—' for null data — but log
  // them so a broken query doesn't silently disappear from Rollbar/Discord.
  useEffect(() => {
    if (bestScoreError) {
      LOGGER.error(
        'MinigamesHub: disclosureGameBestScore query failed:',
        bestScoreError,
      );
    }
  }, [bestScoreError]);
  useEffect(() => {
    if (minigamesStatsError) {
      LOGGER.error(
        'MinigamesHub: minigamesStats query failed:',
        minigamesStatsError,
      );
    }
  }, [minigamesStatsError]);
  useEffect(() => {
    if (mockDraftUsageError) {
      LOGGER.error(
        'MinigamesHub: getMyMockDraftUsage query failed:',
        mockDraftUsageError,
      );
    }
  }, [mockDraftUsageError]);

  // Count only in-progress games (setup or drafting).
  // Show "—" while loading or if the query errored; show "0" for a successful
  // empty result so the user can distinguish "still loading" from "no games".
  const activeGamesCount =
    sdLoading || sdError
      ? null
      : (sdGamesData?.seasonDraftGames?.filter(
          (g) =>
            g.status === SeasonDraftGameStatus.Setup ||
            g.status === SeasonDraftGameStatus.Drafting,
        ).length ?? 0);

  const bestScore = bestScoreData?.disclosureGameBestScore ?? null;
  const dbStats = minigamesStatsData?.minigamesStats;
  const mockDraftsRemaining =
    mockDraftUsageData?.getMyMockDraftUsage?.remaining ?? null;
  const mockDraftsUnlimited =
    mockDraftUsageData?.getMyMockDraftUsage?.isUnlimited === true;
  const mockDraftsResetAt =
    mockDraftUsageData?.getMyMockDraftUsage?.resetsAt ?? null;

  const games: GameDef[] = GAME_TEMPLATES.map((template) => ({
    ...template,
    stat: statFor(template.id, {
      activeGamesCount,
      bestScore,
      mockDraftsRemaining,
      mockDraftsUnlimited,
      mockDraftsResetAt,
    }),
  }));

  const heroStats: Array<{ n: string; l: string } | null> = [
    {
      n:
        dbStats?.playerSeasons != null
          ? `${(dbStats.playerSeasons / 1_000_000).toFixed(1)}M`
          : '—',
      l: 'Player-Seasons',
    },
    null,
    {
      n: dbStats?.earliestYear != null ? String(dbStats.earliestYear) : '—',
      l: 'Earliest Record',
    },
    null,
    {
      n:
        dbStats?.playersTracked != null
          ? `${dbStats.playersTracked.toLocaleString()}+`
          : '—',
      l: 'Players Tracked',
    },
  ];

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <YStack
        maxWidth={1280}
        width="100%"
        alignSelf="center"
        paddingHorizontal={isNarrow ? 16 : 20}
        paddingTop={isNarrow ? 20 : 32}
        paddingBottom={isNarrow ? 64 : 80}
        gap={isNarrow ? 24 : 32}
      >
        {/* Hero section */}
        <XStack
          flexWrap="wrap"
          alignItems="center"
          gap={isNarrow ? 24 : 40}
          padding={isNarrow ? 22 : 44}
          backgroundColor="$surfaceCard"
          borderWidth={1}
          borderColor="$statusAccentBorder"
          borderRadius={24}
          overflow="hidden"
          style={
            Platform.OS === 'web'
              ? { backgroundImage: HERO_BACKGROUND_IMAGE }
              : undefined
          }
          {...SHADOW_LG}
        >
          <YStack flex={1} minWidth={240}>
            <XStack alignItems="center" gap={8}>
              <YStack
                width={7}
                height={7}
                borderRadius={9999}
                backgroundColor="$brandGold"
              />
              <Text
                fontFamily={FONT_DISPLAY}
                fontWeight="700"
                fontSize={12}
                letterSpacing={1.68}
                textTransform="uppercase"
                color="$brandGoldLight"
              >
                Minigames · Off-Season
              </Text>
            </XStack>

            <Text
              fontFamily={FONT_DISPLAY}
              fontWeight="800"
              fontSize={isNarrow ? 34 : 52}
              lineHeight={isNarrow ? 36 : 54}
              letterSpacing={isNarrow ? -0.85 : -1.25}
              color="$fg1"
              marginTop={16}
              marginBottom={18}
            >
              The game doesn&apos;t stop{'\n'}
              <Text
                fontFamily={FONT_BODY}
                fontStyle="italic"
                fontWeight="400"
                color="$brandGoldLight"
                fontSize={isNarrow ? 34 : 52}
              >
                when the season does.
              </Text>
            </Text>

            <Text
              fontFamily={FONT_BODY}
              fontSize={isNarrow ? 15 : 17}
              lineHeight={1.55 * (isNarrow ? 15 : 17)}
              color="$textMuted"
              marginBottom={24}
            >
              Quick-draft showdowns and trivia built on 150 years of archived
              statistics. Play with friends or solo against the record book.
            </Text>

            <XStack
              alignItems="center"
              flexWrap="wrap"
              gap={isNarrow ? 16 : 22}
              paddingTop={20}
              borderTopWidth={1}
              borderColor="$glassBorder"
            >
              {heroStats.map((item, i) =>
                item === null ? (
                  !isNarrow && (
                    <YStack
                      key={i}
                      width={1}
                      height={34}
                      backgroundColor="$outlineSubtle"
                    />
                  )
                ) : (
                  <YStack key={i}>
                    <Text
                      fontFamily={FONT_DISPLAY}
                      fontWeight="800"
                      fontSize={isNarrow ? 22 : 24}
                      color="$fg1"
                      {...TABULAR_NUMS}
                    >
                      {item.n}
                    </Text>
                    <Text
                      fontFamily={FONT_DISPLAY}
                      fontWeight="700"
                      fontSize={isNarrow ? 11 : 10.5}
                      letterSpacing={isNarrow ? 1.54 : 1.47}
                      textTransform="uppercase"
                      color="$textMuted"
                      marginTop={6}
                    >
                      {item.l}
                    </Text>
                  </YStack>
                ),
              )}
            </XStack>
          </YStack>

          {/* Baseball artwork — hidden on narrow viewports to keep the hero
              compact and avoid pushing the mode cards below the fold. */}
          {!isNarrow && (
            <YStack width={220} alignItems="flex-end">
              <MinigamesHubBaseballMark />
            </YStack>
          )}
        </XStack>

        {banner}

        {/* Game cards */}
        <XStack flexWrap="wrap" gap={18}>
          {games.map((g) => (
            <GameCard
              key={g.id}
              game={g}
              onPress={() => onNavigate(g.id)}
              isNarrow={isNarrow}
            />
          ))}
        </XStack>

        {/* Coming soon footer */}
        <XStack
          flexWrap="wrap"
          alignItems="center"
          justifyContent="space-between"
          gap={16}
          backgroundColor="$surfaceSubtle"
          borderWidth={1}
          borderStyle="dashed"
          borderColor="$outlineSubtle"
          borderRadius={12}
          padding={20}
        >
          <YStack>
            <Text
              fontFamily={FONT_DISPLAY}
              fontWeight="700"
              fontSize={12}
              letterSpacing={1.68}
              textTransform="uppercase"
              color="$textMuted"
            >
              Coming Soon
            </Text>
            <Text
              fontFamily={FONT_DISPLAY}
              fontWeight="700"
              fontSize={16}
              color="$textMuted"
              marginTop={4}
              letterSpacing={0.16}
            >
              Trade Deadline · Pennant Picks · Box Score Quiz
            </Text>
          </YStack>
          <Text fontSize={13} color="$textMuted" fontStyle="italic">
            Three more modes in the dugout. Winter is long.
          </Text>
        </XStack>
      </YStack>
    </ScrollView>
  );
}
