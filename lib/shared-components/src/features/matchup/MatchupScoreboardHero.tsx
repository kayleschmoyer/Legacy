import React from 'react';
import { Card, Text, XStack, YStack } from 'tamagui';
import { MatchupStatus } from '@legacy-sports/graphql';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  GREEN,
  GREEN_DEEP,
  GREEN_LIGHT,
  POS_OUTFIELD,
  RED,
  TEXT_MUTED,
  TEXT_PRIMARY,
  withAlpha,
} from '../../utils/colors';
import { FONT_DISPLAY, FONT_MONO } from '../../utils/typography';
import { tamaguiStyled } from '../../utils/tamaguiStyled';

// ── Styled Components ─────────────────────────────────────────────────────────
// tamaguiStyled() isolates Tamagui's any-typed styled() API from strict lint;
// casting the result to a concrete component type keeps call sites lint-clean.

type StyledComponent = React.ComponentType<Record<string, unknown>>;

const HeroCard = tamaguiStyled(Card, {
  overflow: 'hidden',
  borderRadius: '$6',
  borderWidth: 1,
  borderColor: withAlpha(BRAND_GOLD_LIGHT, 0.35),
  backgroundColor: withAlpha(BRAND_NAVY, 0.5),
  width: '100%',
  maxWidth: 800,
}) as StyledComponent;

const TopBand = tamaguiStyled(XStack, {
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingHorizontal: '$5',
  paddingVertical: '$3',
  backgroundColor: withAlpha('#000000', 0.28),
  borderBottomWidth: 1,
  borderBottomColor: withAlpha('#FFFFFF', 0.06),
  flexWrap: 'wrap',
  gap: '$2',
  $sm: {
    paddingHorizontal: '$3',
    paddingVertical: '$2',
  },
}) as StyledComponent;

const StatusChip = tamaguiStyled(XStack, {
  alignItems: 'center',
  gap: '$1.5',
  paddingHorizontal: '$3',
  paddingVertical: '$1.5',
  borderRadius: '$10',
  borderWidth: 1,
}) as StyledComponent;

const TeamSide = tamaguiStyled(YStack, {
  flex: 1,
  flexBasis: 0,
  minWidth: 0,
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: '$2',
  paddingVertical: '$5',
  paddingHorizontal: '$3',
  $sm: {
    paddingVertical: '$3',
    paddingHorizontal: '$2',
  },
}) as StyledComponent;

const Avatar = tamaguiStyled(YStack, {
  width: 52,
  height: 52,
  borderRadius: 26,
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 1,
  borderColor: withAlpha('#FFFFFF', 0.14),
  $sm: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
}) as StyledComponent;

const ScoreText = tamaguiStyled(Text, {
  fontFamily: FONT_DISPLAY,
  fontWeight: '800',
  fontVariant: ['tabular-nums'],
  letterSpacing: -1,
  lineHeight: 56,
  marginTop: '$1',
  $sm: {
    lineHeight: 42,
  },
}) as StyledComponent;

// ── Helpers ───────────────────────────────────────────────────────────────────

// Deterministic avatar palette — mirrors the heritage-navy / gold / seam-red
// brand accents so generated team avatars stay on-brand.
const AVATAR_PALETTE = [
  BRAND_NAVY_LIGHT,
  BRAND_GOLD_LIGHT,
  BRAND_SEAM_RED,
  POS_OUTFIELD,
  GREEN_DEEP,
];

function initialsFromName(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarColor(name?: string | null): string {
  const s = name ?? '';
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

// Pace-target tint for a team's score: green when the team is outperforming its
// projected per-game pace by >10%, red when underperforming by >10%, undefined
// (default color) otherwise. Mirrors web's teamScorePaceStyle in the league
// detail v2 Matchup tab so both platforms colour scores identically.
function paceColor(
  actual: number,
  proj: number | null | undefined,
  gamesPlayed: number,
  totalGames: number,
): string | undefined {
  if (proj == null || totalGames <= 0 || gamesPlayed <= 0) return undefined;
  // Suppress tint for the first game — ratio is too volatile when only 1/N
  // games have been played and would yield false red/green early in the matchup.
  if (gamesPlayed < 2) return undefined;
  const target = proj * (gamesPlayed / totalGames);
  if (target <= 0) return undefined;
  const ratio = actual / target;
  if (ratio > 1.1) return GREEN;
  if (ratio < 0.9) return RED;
  return undefined;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MatchupScoreboardHeroTeam {
  id?: number | null;
  name?: string | null;
  /** Optional team brand color; overrides the generated avatar background. */
  primaryColor?: string | null;
  score?: number | null;
  projectedScore?: number | null;
  /** Optional W-L-T record string (e.g. "7-3-1"). */
  record?: string | null;
}

export interface MatchupScoreboardHeroProps {
  weekNumber?: number | null;
  totalMatchups?: number | null;
  /**
   * Matchup status. Typed as `string` so the presentational layer stays
   * decoupled from any platform's generated GraphQL enum; the recognised values
   * are the `MatchupStatus` members ('in_progress', 'completed', ...).
   */
  status?: string | null;
  team1: MatchupScoreboardHeroTeam;
  team2: MatchupScoreboardHeroTeam;
  gamesPlayed: number;
  totalGames: number;
  /** When provided, team avatars/names become pressable to view that team. */
  onTeamPress?: (teamId: number) => void;
}

interface StatusConfig {
  bg: string;
  border: string;
  text: string;
  label: string;
  live: boolean;
}

function statusConfigFor(status?: string | null): StatusConfig {
  if (status == null) {
    return {
      bg: withAlpha(TEXT_MUTED, 0.14),
      border: withAlpha(TEXT_MUTED, 0.4),
      text: TEXT_MUTED,
      label: 'Status unknown',
      live: false,
    };
  }
  // Cast to MatchupStatus so TypeScript enforces exhaustiveness via the never default.
  const s = status as MatchupStatus;
  switch (s) {
    case MatchupStatus.InProgress:
      return {
        bg: withAlpha(GREEN, 0.16),
        border: withAlpha(GREEN, 0.5),
        text: GREEN_LIGHT,
        label: 'Live',
        live: true,
      };
    case MatchupStatus.Completed:
      return {
        bg: withAlpha(BRAND_NAVY_LIGHT, 0.18),
        border: withAlpha(BRAND_NAVY_LIGHT, 0.5),
        text: BRAND_GOLD_LIGHT,
        label: 'Final',
        live: false,
      };
    case MatchupStatus.Cancelled:
      return {
        bg: withAlpha(TEXT_MUTED, 0.14),
        border: withAlpha(TEXT_MUTED, 0.4),
        text: TEXT_MUTED,
        label: 'Cancelled',
        live: false,
      };
    case MatchupStatus.Scheduled:
      return {
        bg: withAlpha(TEXT_MUTED, 0.14),
        border: withAlpha(TEXT_MUTED, 0.4),
        text: TEXT_MUTED,
        label: 'Scheduled',
        live: false,
      };
    default: {
      // Compile-time exhaustiveness: adding a new MatchupStatus without a case
      // here will cause a TypeScript error.
      const _exhaustive: never = s;
      void _exhaustive;
      return {
        bg: withAlpha(TEXT_MUTED, 0.14),
        border: withAlpha(TEXT_MUTED, 0.4),
        text: TEXT_MUTED,
        label: 'Status unknown',
        live: false,
      };
    }
  }
}

// ── Team panel ──────────────────────────────────────────────────────────────

function TeamPanel({
  team,
  leading,
  gamesPlayed,
  totalGames,
  onTeamPress,
}: {
  team: MatchupScoreboardHeroTeam;
  leading: boolean;
  gamesPlayed: number;
  totalGames: number;
  onTeamPress?: (teamId: number) => void;
}) {
  const score = team.score ?? 0;
  const pace = paceColor(score, team.projectedScore, gamesPlayed, totalGames);
  const scoreColor = pace ?? (leading ? BRAND_GOLD_LIGHT : TEXT_PRIMARY);
  const pressable = onTeamPress != null && team.id != null;
  const onPress =
    pressable && team.id != null
      ? () => onTeamPress?.(team.id as number)
      : undefined;

  return (
    <TeamSide>
      <Avatar
        backgroundColor={team.primaryColor ?? avatarColor(team.name)}
        cursor={pressable ? 'pointer' : undefined}
        onPress={onPress}
      >
        <Text
          fontFamily={FONT_DISPLAY}
          fontWeight="700"
          fontSize="$5"
          color="#FFFFFF"
        >
          {initialsFromName(team.name)}
        </Text>
      </Avatar>
      <Text
        fontFamily={FONT_DISPLAY}
        fontWeight="700"
        fontSize="$6"
        color={TEXT_PRIMARY}
        textAlign="center"
        numberOfLines={2}
        cursor={pressable ? 'pointer' : undefined}
        hoverStyle={pressable ? { opacity: 0.85 } : undefined}
        onPress={onPress}
      >
        {team.name ?? 'Team'}
      </Text>
      <Text fontFamily={FONT_MONO} fontSize="$2" color={TEXT_MUTED}>
        {team.record ?? '—'}
      </Text>
      <ScoreText fontSize={52} $sm={{ fontSize: 40 }} color={scoreColor}>
        {score.toFixed(2)}
      </ScoreText>
      {team.projectedScore != null && (
        <Text
          fontFamily={FONT_MONO}
          fontSize="$1"
          color={withAlpha(TEXT_MUTED, 0.85)}
        >
          {team.projectedScore.toFixed(2)} proj
        </Text>
      )}
    </TeamSide>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * MatchupScoreboardHero — broadcast-style scoreboard hero with rich detail:
 * projected scores, status chip, per-team W-L-T record, and pace-coloured scores
 * (green outperforming / red underperforming projected pace).
 *
 * Pure presentational component: it receives already-computed scores and
 * projections and performs no data fetching. Web (league detail v2 Matchup tab)
 * and mobile (MatchupDetailScreen) wrap it with their own GraphQL data layers.
 * Ported from web's bespoke ScoreboardHero so both platforms render web's
 * canonical design (LS-7815, epic LS-7708).
 */
export function MatchupScoreboardHero({
  weekNumber,
  totalMatchups,
  status,
  team1,
  team2,
  gamesPlayed,
  totalGames,
  onTeamPress,
}: MatchupScoreboardHeroProps) {
  const score1 = team1.score ?? 0;
  const score2 = team2.score ?? 0;
  const team1Leading = score1 >= score2;
  const chip = statusConfigFor(status);

  return (
    <HeroCard role="region" aria-label={`Week ${weekNumber ?? 1} scoreboard`}>
      <TopBand>
        <XStack alignItems="center" gap="$2" flexWrap="wrap">
          <StatusChip backgroundColor={chip.bg} borderColor={chip.border}>
            {chip.live && (
              <YStack
                width={6}
                height={6}
                borderRadius={3}
                backgroundColor={chip.text}
              />
            )}
            <Text
              fontSize="$2"
              fontWeight="700"
              color={chip.text}
              letterSpacing={0.5}
            >
              {chip.label} · Week {weekNumber ?? '—'}
            </Text>
          </StatusChip>
          <Text fontSize="$2" color={TEXT_MUTED}>
            Head-to-Head · Matchup {weekNumber ?? '?'}
            {totalMatchups ? `/${totalMatchups}` : ''}
          </Text>
        </XStack>
      </TopBand>

      <XStack alignItems="flex-start">
        <TeamPanel
          team={team1}
          leading={team1Leading}
          gamesPlayed={gamesPlayed}
          totalGames={totalGames}
          onTeamPress={onTeamPress}
        />
        <YStack alignSelf="center" paddingHorizontal="$2">
          <Text
            fontFamily={FONT_DISPLAY}
            fontWeight="800"
            fontSize="$5"
            letterSpacing={3}
            color={withAlpha(TEXT_MUTED, 0.8)}
          >
            VS
          </Text>
        </YStack>
        <TeamPanel
          team={team2}
          leading={!team1Leading}
          gamesPlayed={gamesPlayed}
          totalGames={totalGames}
          onTeamPress={onTeamPress}
        />
      </XStack>
    </HeroCard>
  );
}
