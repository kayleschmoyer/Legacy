import React from 'react';
import { Platform } from 'react-native';
import { Card, Text, XStack, YStack } from 'tamagui';
import { Activity } from '@tamagui/lucide-icons/icons/Activity';
import { CheckCircle } from '@tamagui/lucide-icons/icons/CheckCircle';
import { Clock } from '@tamagui/lucide-icons/icons/Clock';
import { XCircle } from '@tamagui/lucide-icons/icons/XCircle';
import { type MatchupFragment, MatchupStatus } from '@legacy-sports/graphql';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  withAlpha,
} from '../../utils/colors';
import { tamaguiStyled } from '../../utils/tamaguiStyled';
import { AvatarImage } from '../../components/AvatarImage';

export interface MatchupCardProps {
  matchup: MatchupFragment | null | undefined;
  onPress?: () => void;
  showWeek?: boolean;
  /**
   * Optional team-logo URLs. The shared `MatchupFragment` carries team
   * names but not logos, so cross-platform consumers supply the logo via
   * this slot — web resolves it through `useGetLeagueTeamsQuery`, native
   * passes nothing. When absent, `AvatarImage` falls back to brand-gradient
   * initials derived from the team name (AC2).
   */
  team1LogoUrl?: string | null;
  team2LogoUrl?: string | null;
}

// ── Styled Components ─────────────────────────────────────────────────────────
// tamaguiStyled() isolates Tamagui's any-typed styled() API from strict lint;
// casting the result to a concrete component type keeps call sites lint-clean.

type StyledComponent = React.ComponentType<Record<string, unknown>>;

const CardContainer = tamaguiStyled(Card, {
  overflow: 'hidden',
  borderRadius: '$5',
  borderWidth: 1,
  borderColor: '$surfacePanelBorder',
  cursor: 'pointer',
  pressStyle: { scale: 0.98, opacity: 0.9 },
  hoverStyle: { borderColor: withAlpha(BRAND_NAVY_LIGHT, 0.5) },
  animation: 'quick',
  margin: '$1',
}) as StyledComponent;

const AccentBar = tamaguiStyled(YStack, {
  height: 3,
  width: '100%',
}) as StyledComponent;

const StatusDot = tamaguiStyled(YStack, {
  width: 8,
  height: 8,
  borderRadius: 4,
}) as StyledComponent;

const ScoreValue = tamaguiStyled(Text, {
  fontWeight: '800',
  fontVariant: ['tabular-nums'],
  letterSpacing: -0.5,
}) as StyledComponent;

// ── Status presentation ───────────────────────────────────────────────────────

interface StatusPresentation {
  /** Top accent-bar color. */
  accent: string;
  /** Badge background color. */
  bg: string;
  /** Badge text color. */
  color: string;
  /** Badge label. */
  label: string;
  /** Badge leading icon. */
  icon: React.ReactNode;
}

function getStatusPresentation(
  status: MatchupStatus | null | undefined,
): StatusPresentation {
  switch (status) {
    case MatchupStatus.InProgress:
      return {
        accent: '$green9',
        bg: '$green3',
        color: '$green11',
        label: 'Live',
        icon: <Activity size={12} color="var(--green11)" />,
      };
    case MatchupStatus.Completed:
      return {
        accent: BRAND_NAVY_LIGHT,
        bg: withAlpha(BRAND_NAVY_LIGHT, 0.18),
        color: BRAND_GOLD_LIGHT,
        label: 'Final',
        icon: <CheckCircle size={12} color={BRAND_GOLD_LIGHT} />,
      };
    case MatchupStatus.Cancelled:
      return {
        accent: '$red9',
        bg: '$red3',
        color: '$red11',
        label: 'Cancelled',
        icon: <XCircle size={12} color="var(--red11)" />,
      };
    case MatchupStatus.Scheduled:
    default:
      return {
        accent: '$gray7',
        bg: '$gray3',
        color: '$gray11',
        label: 'Scheduled',
        icon: <Clock size={12} color="var(--gray11)" />,
      };
  }
}

// ── Team row ───────────────────────────────────────────────────────────────────

interface TeamRowProps {
  name: string;
  score: number | null | undefined;
  logoUrl: string | null | undefined;
  isWinner: boolean;
}

function TeamRow({ name, score, logoUrl, isWinner }: TeamRowProps) {
  return (
    <XStack justifyContent="space-between" alignItems="center">
      <XStack alignItems="center" gap="$2" flex={1}>
        {isWinner && <StatusDot backgroundColor="$green9" />}
        <AvatarImage url={logoUrl} username={name} size={24} borderRadius={3} />
        <Text
          fontSize="$4"
          fontWeight={isWinner ? '700' : '500'}
          color={isWinner ? '$color' : '$textMuted'}
          numberOfLines={1}
        >
          {name}
        </Text>
      </XStack>
      <ScoreValue fontSize="$6" color={isWinner ? '$color' : '$textMuted'}>
        {score?.toFixed(2) ?? '-'}
      </ScoreValue>
    </XStack>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * MatchupCard — modern card displaying a matchup between two teams.
 *
 * Renders team logos (or initials fallback), scores, a status-driven accent
 * bar, a styled status badge, and a winner indicator dot. Cross-platform:
 * the team-logo data dependency is supplied via the `team1LogoUrl` /
 * `team2LogoUrl` slots rather than a web-only GraphQL query (LS-7800).
 */
export function MatchupCard({
  matchup,
  onPress,
  showWeek = true,
  team1LogoUrl,
  team2LogoUrl,
}: MatchupCardProps) {
  if (!matchup) {
    return null;
  }

  const { weekNumber, team1Score, team2Score, status, team1, team2 } = matchup;

  const isCompleted = status === MatchupStatus.Completed;
  const team1Wins = isCompleted && (team1Score ?? 0) > (team2Score ?? 0);
  const team2Wins = isCompleted && (team2Score ?? 0) > (team1Score ?? 0);

  const statusConfig = getStatusPresentation(status);

  // Tamagui drops `data-testid` on an animated Card with onPress in Chromium
  // (LS-4133, LS-4215) — same issue worked around in
  // MatchupRosterEditorView. A plain div wrapper guarantees the attribute
  // reaches the real DOM; RN has no host tag for a lowercase `div`, so the
  // wrapper must stay web-only (LS-9163).
  const card = (
    <CardContainer
      onPress={onPress}
      testID={Platform.OS === 'web' ? undefined : 'matchup-card'}
    >
      {/* Accent bar */}
      <AccentBar backgroundColor={statusConfig.accent} />

      {/* Header row */}
      <XStack
        justifyContent="space-between"
        alignItems="center"
        paddingHorizontal="$4"
        paddingTop="$3"
        paddingBottom="$2"
      >
        {showWeek && (
          <Text fontSize="$2" fontWeight="600" color="$textMuted">
            Week {weekNumber}
          </Text>
        )}
        <XStack
          alignItems="center"
          gap="$1.5"
          paddingHorizontal="$2.5"
          paddingVertical="$1"
          borderRadius="$10"
          backgroundColor={statusConfig.bg}
        >
          {statusConfig.icon}
          <Text
            fontSize="$1"
            fontWeight="700"
            color={statusConfig.color}
            textTransform="uppercase"
            letterSpacing={0.3}
          >
            {statusConfig.label}
          </Text>
        </XStack>
      </XStack>

      {/* Teams & Scores */}
      <YStack paddingHorizontal="$4" paddingBottom="$4" gap="$2.5">
        <TeamRow
          name={team1?.name ?? 'Team 1'}
          score={team1Score}
          logoUrl={team1LogoUrl}
          isWinner={team1Wins}
        />

        {/* Divider */}
        <YStack height={1} backgroundColor="$surfacePanelBorder" />

        <TeamRow
          name={team2?.name ?? 'Team 2'}
          score={team2Score}
          logoUrl={team2LogoUrl}
          isWinner={team2Wins}
        />
      </YStack>
    </CardContainer>
  );

  return Platform.OS === 'web' ? (
    <div data-testid="matchup-card">{card}</div>
  ) : (
    card
  );
}
