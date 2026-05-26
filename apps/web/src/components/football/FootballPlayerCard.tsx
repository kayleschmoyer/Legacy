import React from 'react';
import { useNavigate } from 'react-router-dom';
import { styled, Text, XStack, YStack } from 'tamagui';
import { NFL_TEAMS } from '@legacy-sports/shared-components';
import type { FootballPlayersQuery } from '../../api/db/graphql.generated';
import {
  BRAND_NAVY,
  OUTLINE_SUBTLE,
  POS_DEF,
  POS_K,
  POS_QB,
  POS_RB,
  POS_TE,
  POS_WR,
  SURFACE_CARD,
  SURFACE_PANEL,
  TEXT_MUTED,
  TEXT_PRIMARY,
  withAlpha,
} from '../../constants/colors';
import { FONT_BODY, FONT_DISPLAY } from '../../constants/typography';

export type FootballPlayerNode = NonNullable<
  NonNullable<
    NonNullable<FootballPlayersQuery['footballPlayers']>['nodes']
  >[number]
>;

const POSITION_COLORS: Record<string, string> = {
  QB: POS_QB,
  RB: POS_RB,
  WR: POS_WR,
  TE: POS_TE,
  K: POS_K,
  DST: POS_DEF,
  DL: POS_DEF,
  LB: POS_DEF,
  DB: POS_DEF,
};

function getPositionColor(pos: string | null | undefined): string {
  return (pos && POSITION_COLORS[pos]) ?? BRAND_NAVY;
}

const CardContainer = styled(YStack, {
  backgroundColor: SURFACE_CARD,
  borderWidth: 1,
  borderColor: OUTLINE_SUBTLE,
  borderRadius: 10,
  overflow: 'hidden',
  cursor: 'pointer',
  pressStyle: { opacity: 0.85, scale: 0.99 },
  hoverStyle: { borderColor: BRAND_NAVY, backgroundColor: SURFACE_PANEL },
  animation: 'quick',
});

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

function PositionBadge({ position }: { position: string | null | undefined }) {
  const pos = position ?? '?';
  const color = getPositionColor(pos);
  return (
    <YStack
      paddingHorizontal={7}
      paddingVertical={2}
      borderRadius={4}
      backgroundColor={withAlpha(color, 0.15)}
      borderWidth={1}
      borderColor={withAlpha(color, 0.5)}
    >
      <Text
        fontSize={11}
        fontWeight="700"
        color={color}
        fontFamily={FONT_BODY}
        letterSpacing={0.5}
      >
        {pos}
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

function OffenseStats({ player }: { player: FootballPlayerNode }) {
  const stats = player.careerStats;
  const pos = player.position;

  if (!stats) {
    return (
      <Text fontSize={12} color={TEXT_MUTED} fontFamily={FONT_BODY}>
        No stats available
      </Text>
    );
  }

  if (pos === 'QB') {
    const p = stats.passing;
    return (
      <XStack flexWrap="wrap" gap={10}>
        <StatLine value={fmt(p?.yds)} label="YDS" />
        <StatLine value={fmt(p?.td)} label="TD" />
        <StatLine value={fmt(p?.int)} label="INT" />
        <StatLine value={fmtFloat(p?.rating)} label="RTG" />
      </XStack>
    );
  }

  if (pos === 'RB') {
    const r = stats.rushing;
    return (
      <XStack flexWrap="wrap" gap={10}>
        <StatLine value={fmt(r?.yds)} label="YDS" />
        <StatLine value={fmt(r?.td)} label="TD" />
      </XStack>
    );
  }

  if (pos === 'WR' || pos === 'TE') {
    const r = stats.receiving;
    return (
      <XStack flexWrap="wrap" gap={10}>
        <StatLine value={fmt(r?.rec)} label="REC" />
        <StatLine value={fmt(r?.yds)} label="YDS" />
        <StatLine value={fmt(r?.td)} label="TD" />
      </XStack>
    );
  }

  if (pos === 'K') {
    const k = stats.kicking;
    const fgPct = k?.fga && k.fga > 0 ? ((k.fgm ?? 0) / k.fga) * 100 : null;
    return (
      <XStack flexWrap="wrap" gap={10}>
        <StatLine value={`${fmt(k?.fgm)}/${fmt(k?.fga)}`} label="FG" />
        <StatLine value={`${fmtFloat(fgPct)}%`} label="" />
      </XStack>
    );
  }

  return (
    <Text fontSize={12} color={TEXT_MUTED} fontFamily={FONT_BODY}>
      No stats available
    </Text>
  );
}

function DstStats({ player }: { player: FootballPlayerNode }) {
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

function IdpStats({ player }: { player: FootballPlayerNode }) {
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

interface Props {
  player: FootballPlayerNode;
  onAddToRoster?: (player: FootballPlayerNode) => void;
}

export function FootballPlayerCard({ player, onAddToRoster }: Props) {
  const navigate = useNavigate();
  const pos = player.position;
  const isDst = player.isDst ?? false;
  const isIdp = pos === 'DL' || pos === 'LB' || pos === 'DB';
  const teamData = player.nflTeam ? NFL_TEAMS[player.nflTeam] : null;

  return (
    <CardContainer
      onPress={() =>
        player.id != null && navigate(`/football/players/${player.id}`)
      }
      padding={14}
      gap={10}
    >
      {/* Header row */}
      <XStack gap={12} alignItems="flex-start">
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
            <PositionBadge position={isDst ? 'DST' : pos} />
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
      <YStack paddingLeft={60}>
        {isDst ? (
          <DstStats player={player} />
        ) : isIdp ? (
          <IdpStats player={player} />
        ) : (
          <OffenseStats player={player} />
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
    </CardContainer>
  );
}
