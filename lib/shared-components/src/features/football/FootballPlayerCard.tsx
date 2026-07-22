import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { StatCategory } from './StatCategory';
import { NFL_TEAMS } from '../../constants/nflTeams';
import {
  BRAND_GOLD,
  BRAND_NAVY,
  OUTLINE_SUBTLE,
  POS_DB,
  POS_DL,
  POS_DST,
  POS_K,
  POS_LB,
  POS_QB,
  POS_RB,
  POS_TE,
  POS_WR,
  SURFACE_CARD,
  SURFACE_PANEL,
  TEXT_MUTED,
  TEXT_PRIMARY,
  WHITE,
  withAlpha,
} from '../../utils/colors';
import { FONT_BODY, FONT_DISPLAY } from '../../utils/typography';
import { PositionBadge } from '../../components/PositionBadge';

/**
 * Portable shape for a football player rendered by {@link FootballPlayerCard}.
 *
 * Mirrors the subset of the `FootballPlayer` GraphQL type the card actually
 * reads, so the component does not depend on any app-specific generated types.
 * Both web and mobile pass their query results directly — the generated
 * `FootballPlayer` node is structurally assignable to this interface.
 */
export interface FootballPlayerCardStats {
  fantasyPoints?: number | null;
  passing?: {
    yds?: number | null;
    td?: number | null;
    int?: number | null;
    rating?: number | null;
  } | null;
  rushing?: {
    yds?: number | null;
    td?: number | null;
  } | null;
  receiving?: {
    rec?: number | null;
    yds?: number | null;
    td?: number | null;
  } | null;
  kicking?: {
    fgm?: number | null;
    fga?: number | null;
    fgPct?: number | null;
  } | null;
  defense?: {
    sacks?: number | null;
    int?: number | null;
    ptsAllowedPerG?: number | null;
  } | null;
  idp?: {
    soloTkl?: number | null;
    sacks?: number | null;
    int?: number | null;
    ff?: number | null;
  } | null;
}

export interface FootballPlayerCardPlayer {
  id: number;
  firstName?: string | null;
  lastName?: string | null;
  position?: string | null;
  nflTeam?: string | null;
  isDst?: boolean | null;
  careerStats?: FootballPlayerCardStats | null;
}

const POSITION_COLORS: Record<string, string> = {
  QB: POS_QB,
  RB: POS_RB,
  WR: POS_WR,
  TE: POS_TE,
  K: POS_K,
  DST: POS_DST,
  DL: POS_DL,
  LB: POS_LB,
  DB: POS_DB,
};

function getPositionColor(pos: string | null | undefined): string {
  return (pos && POSITION_COLORS[pos]) ?? BRAND_NAVY;
}

function TeamBadge({
  teamAbbr,
  isDst,
}: {
  teamAbbr: string | null | undefined;
  isDst: boolean;
}) {
  const team = teamAbbr ? NFL_TEAMS[teamAbbr] : null;
  const primaryColor = team?.primaryColor ?? '#1B3A5C';
  const secondaryColor = team?.secondaryColor ?? '#C5A55A';

  return (
    <YStack
      width={48}
      height={48}
      borderRadius={8}
      backgroundColor={primaryColor}
      alignItems="center"
      justifyContent="center"
      borderWidth={1}
      borderColor={secondaryColor}
      flexShrink={0}
    >
      <Text
        fontSize={isDst ? 9 : 12}
        fontWeight="800"
        color={secondaryColor}
        fontFamily={FONT_DISPLAY}
        letterSpacing={0.5}
        textAlign="center"
      >
        {teamAbbr ?? '?'}
      </Text>
    </YStack>
  );
}

function StatLine({ label, value }: { label: string; value: string | number }) {
  return (
    <XStack gap={4} alignItems="baseline">
      <Text
        fontSize={13}
        fontWeight="700"
        color={TEXT_PRIMARY}
        fontVariant={['tabular-nums']}
      >
        {value}
      </Text>
      <Text fontSize={11} color={TEXT_MUTED} fontFamily={FONT_BODY}>
        {label}
      </Text>
    </XStack>
  );
}

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString();
}

function fmtFloat(n: number | null | undefined, decimals = 1): string {
  if (n == null) return '—';
  return n.toFixed(decimals);
}

/**
 * Renders a labeled stat row for every offensive category with a non-null
 * record (LS-6242). The server returns each category independently, so a QB
 * with rushing data shows both a Pass and a Rush row, an RB with receptions
 * shows Rush and Rec, etc. Gating on category presence rather than the position
 * label stops multi-category stats from being silently discarded.
 *
 * QB rushing-TD fix (LS-6472): for QBs the passing "TD" label is renamed to
 * "Pass TD" and a "Rush TD" chip is inlined in the passing section when rushing
 * data is present, so dual-threat QBs (Lamar Jackson, Jalen Hurts, etc.) show
 * both values side-by-side rather than burying rush TDs in a separate row.
 * The Rush row for QBs keeps the YDS context but omits TD to avoid duplication.
 */
function OffenseStats({ player }: { player: FootballPlayerCardPlayer }) {
  const stats = player.careerStats;
  const isQb = player.position === 'QB';

  if (!stats) {
    return (
      <Text fontSize={12} color={TEXT_MUTED} fontFamily={FONT_BODY}>
        No stats available
      </Text>
    );
  }

  const { passing, rushing, receiving, kicking } = stats;
  // Server-provided FG% (LS-6244) — single source of truth, no client recompute.
  const fgPct = kicking?.fgPct ?? null;

  if (!passing && !rushing && !receiving && !kicking) {
    return (
      <Text fontSize={12} color={TEXT_MUTED} fontFamily={FONT_BODY}>
        No stats available
      </Text>
    );
  }

  return (
    <YStack gap={6}>
      {passing && (
        <StatCategory label="Pass">
          <StatLine value={fmt(passing.yds)} label="YDS" />
          <StatLine value={fmt(passing.td)} label={isQb ? 'Pass TD' : 'TD'} />
          {isQb && rushing?.td != null && (
            <StatLine value={fmt(rushing.td)} label="Rush TD" />
          )}
          <StatLine value={fmt(passing.int)} label="INT" />
          <StatLine value={fmtFloat(passing.rating)} label="RTG" />
        </StatCategory>
      )}
      {rushing && (
        <StatCategory label="Rush">
          <StatLine value={fmt(rushing.yds)} label="YDS" />
          {(!isQb || !passing) && (
            <StatLine value={fmt(rushing.td)} label="TD" />
          )}
        </StatCategory>
      )}
      {receiving && (
        <StatCategory label="Rec">
          <StatLine value={fmt(receiving.rec)} label="REC" />
          <StatLine value={fmt(receiving.yds)} label="YDS" />
          <StatLine value={fmt(receiving.td)} label="TD" />
        </StatCategory>
      )}
      {kicking && (
        <StatCategory label="Kick">
          <StatLine
            value={`${fmt(kicking.fgm)}/${fmt(kicking.fga)}`}
            label="FG"
          />
          <StatLine
            value={fgPct == null || isNaN(fgPct) ? '—' : `${fmtFloat(fgPct)}%`}
            label="FG%"
          />
        </StatCategory>
      )}
    </YStack>
  );
}

function DstStats({ player }: { player: FootballPlayerCardPlayer }) {
  const d = player.careerStats?.defense;
  if (!d) {
    return (
      <Text fontSize={12} color={TEXT_MUTED} fontFamily={FONT_BODY}>
        No stats available
      </Text>
    );
  }
  return (
    <XStack flexWrap="wrap" gap={10}>
      <StatLine value={fmtFloat(d.sacks)} label="Sacks" />
      <StatLine value={fmt(d.int)} label="INT" />
      <StatLine value={fmtFloat(d.ptsAllowedPerG)} label="Pts Allowed/G" />
    </XStack>
  );
}

function IdpStats({ player }: { player: FootballPlayerCardPlayer }) {
  const idp = player.careerStats?.idp;
  if (!idp) {
    return (
      <Text fontSize={12} color={TEXT_MUTED} fontFamily={FONT_BODY}>
        No stats available
      </Text>
    );
  }
  return (
    <XStack flexWrap="wrap" gap={10}>
      <StatLine value={fmt(idp.soloTkl)} label="Solo" />
      <StatLine value={fmtFloat(idp.sacks)} label="Sacks" />
      <StatLine value={fmt(idp.int)} label="INT" />
      <StatLine value={fmt(idp.ff)} label="FF" />
    </XStack>
  );
}

export interface FootballPlayerCardProps {
  player: FootballPlayerCardPlayer;
  /**
   * Called when the card is pressed to navigate to the player's detail view.
   * Apps supply their own navigation (e.g. react-router on web, expo-router on
   * mobile); the card stays platform-agnostic.
   */
  onNavigateToPlayer?: (playerId: string) => void;
  onAddToRoster?: (player: FootballPlayerCardPlayer) => void;
  isSelectable?: boolean;
  isSelected?: boolean;
  onSelect?: (playerId: number) => void;
}

export function FootballPlayerCard({
  player,
  onNavigateToPlayer,
  onAddToRoster,
  isSelectable = false,
  isSelected = false,
  onSelect,
}: FootballPlayerCardProps) {
  const pos = player.position;
  const isDst = player.isDst ?? false;
  const isIdp = pos === 'DL' || pos === 'LB' || pos === 'DB';
  const teamData = player.nflTeam ? NFL_TEAMS[player.nflTeam] : null;

  function handlePress() {
    if (isSelectable) {
      onSelect?.(player.id);
    } else {
      player.id != null && onNavigateToPlayer?.(String(player.id));
    }
  }

  return (
    <YStack
      backgroundColor={SURFACE_CARD}
      borderWidth={isSelected ? 2 : 1}
      borderColor={isSelected ? BRAND_NAVY : OUTLINE_SUBTLE}
      borderRadius={10}
      overflow="hidden"
      cursor="pointer"
      pressStyle={{ opacity: 0.85, scale: 0.99 }}
      hoverStyle={{ borderColor: BRAND_NAVY, backgroundColor: SURFACE_PANEL }}
      animation="quick"
      onPress={handlePress}
      role={isSelectable ? 'checkbox' : 'button'}
      aria-checked={isSelectable ? isSelected : undefined}
      tabIndex={0}
      onKeyDown={(e: { key: string; preventDefault: () => void }) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handlePress();
        }
      }}
      padding={14}
      gap={10}
    >
      {/* Header row */}
      <XStack gap={12} alignItems="flex-start">
        {isSelectable && (
          <YStack
            width={20}
            height={20}
            borderRadius={4}
            borderWidth={2}
            borderColor={isSelected ? BRAND_NAVY : OUTLINE_SUBTLE}
            backgroundColor={isSelected ? BRAND_NAVY : 'transparent'}
            alignItems="center"
            justifyContent="center"
            alignSelf="center"
            flexShrink={0}
          >
            {isSelected && (
              <Text fontSize={12} color={WHITE} fontWeight="700">
                ✓
              </Text>
            )}
          </YStack>
        )}
        <TeamBadge teamAbbr={player.nflTeam} isDst={isDst} />

        <YStack flex={1} gap={4}>
          <Text
            fontSize={15}
            fontWeight="700"
            color={TEXT_PRIMARY}
            fontFamily={FONT_DISPLAY}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {[player.firstName, player.lastName].filter(Boolean).join(' ') ||
              'Unknown Player'}
          </Text>
          <XStack gap={6} alignItems="center">
            <PositionBadge
              position={isDst ? 'DST' : (pos ?? '?')}
              color={getPositionColor(isDst ? 'DST' : pos)}
              showBorder
              paddingHorizontal={7}
              paddingVertical={2}
              borderRadius={4}
              fontSize={11}
              fontFamily={FONT_BODY}
              letterSpacing={0.5}
            />
            {player.nflTeam && (
              <Text fontSize={12} color={TEXT_MUTED} fontFamily={FONT_BODY}>
                {player.nflTeam ?? ''}
                {teamData
                  ? ` · ${isDst ? teamData.city : teamData.abbreviation}`
                  : ''}
              </Text>
            )}
          </XStack>
        </YStack>
      </XStack>

      {/* Stats */}
      <YStack paddingLeft={60} gap={8}>
        {isDst ? (
          <DstStats player={player} />
        ) : isIdp ? (
          <IdpStats player={player} />
        ) : (
          <OffenseStats player={player} />
        )}
        {player.careerStats?.fantasyPoints != null && (
          <XStack gap={4} alignItems="baseline">
            <Text
              fontSize={13}
              fontWeight="700"
              color={BRAND_GOLD}
              fontVariant={['tabular-nums']}
            >
              {player.careerStats.fantasyPoints.toFixed(1)}
            </Text>
            <Text fontSize={11} color={TEXT_MUTED} fontFamily={FONT_BODY}>
              Career FPts
            </Text>
          </XStack>
        )}
      </YStack>

      {/* Optional action */}
      {onAddToRoster && (
        <XStack justifyContent="flex-end">
          <YStack
            paddingHorizontal={12}
            paddingVertical={5}
            borderRadius={6}
            backgroundColor={withAlpha(BRAND_NAVY, 0.3)}
            borderWidth={1}
            borderColor={BRAND_NAVY}
            onPress={(e: { stopPropagation: () => void }) => {
              e.stopPropagation();
              onAddToRoster(player);
            }}
          >
            <Text fontSize={12} color={TEXT_PRIMARY} fontWeight="600">
              Add to Roster
            </Text>
          </YStack>
        </XStack>
      )}
    </YStack>
  );
}
