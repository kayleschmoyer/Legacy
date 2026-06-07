import React from 'react';
import { Spinner, Text, XStack, YStack } from 'tamagui';
import { ArrowLeft } from '@tamagui/lucide-icons';
import { NFL_TEAMS } from '../../constants/nflTeams';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_NAVY,
  BRAND_SEAM_RED_LIGHT,
  OUTLINE_SUBTLE,
  SURFACE_CARD,
  TEXT_MUTED,
  TEXT_PRIMARY,
  withAlpha,
} from '../../utils/colors';
import { FONT_BODY, FONT_DISPLAY } from '../../utils/typography';

/**
 * Portable career-stats shape consumed by {@link FootballPlayerDetail}.
 *
 * Mirrors the subset of the `FootballPlayer.careerStats` GraphQL type the
 * detail view reads. Both web and mobile pass their generated query results
 * directly — the generated node is structurally assignable to this interface.
 * Note this superset of {@link FootballPlayerCardStats} additionally reads
 * `idp.astTkl`, which the list card omits.
 */
export interface FootballPlayerDetailStats {
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
  } | null;
  defense?: {
    sacks?: number | null;
    int?: number | null;
    ptsAllowedPerG?: number | null;
  } | null;
  idp?: {
    soloTkl?: number | null;
    astTkl?: number | null;
    sacks?: number | null;
    int?: number | null;
    ff?: number | null;
  } | null;
}

export interface FootballPlayerDetailPlayer {
  id: number;
  firstName?: string | null;
  lastName?: string | null;
  position?: string | null;
  nflTeam?: string | null;
  isDst?: boolean | null;
  careerStats?: FootballPlayerDetailStats | null;
}

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString();
}

function fmtFloat(n: number | null | undefined, decimals = 1): string {
  if (n == null) return '—';
  return n.toFixed(decimals);
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <YStack alignItems="center" gap={2} minWidth={50}>
      <Text
        fontSize={16}
        fontWeight="700"
        color={TEXT_PRIMARY}
        fontVariant={['tabular-nums']}
      >
        {value}
      </Text>
      <Text
        fontSize={11}
        color={TEXT_MUTED}
        fontFamily={FONT_BODY}
        textAlign="center"
      >
        {label}
      </Text>
    </YStack>
  );
}

function StatGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <YStack gap={8}>
      <Text
        fontSize={13}
        color={TEXT_MUTED}
        fontFamily={FONT_BODY}
        fontWeight="600"
      >
        {title}
      </Text>
      <XStack
        backgroundColor={SURFACE_CARD}
        borderWidth={1}
        borderColor={OUTLINE_SUBTLE}
        borderRadius={8}
        padding={16}
        gap={20}
        flexWrap="wrap"
      >
        {children}
      </XStack>
    </YStack>
  );
}

function IdpStatsTable({ stats }: { stats: FootballPlayerDetailStats }) {
  const idp = stats.idp;
  return (
    <StatGroup title="Career IDP Stats">
      <StatCell label="Solo" value={fmt(idp?.soloTkl)} />
      <StatCell label="Ast" value={fmt(idp?.astTkl)} />
      <StatCell label="Sacks" value={fmtFloat(idp?.sacks)} />
      <StatCell label="INT" value={fmt(idp?.int)} />
      <StatCell label="FF" value={fmt(idp?.ff)} />
    </StatGroup>
  );
}

function DstStatsTable({ stats }: { stats: FootballPlayerDetailStats }) {
  const d = stats.defense;
  return (
    <StatGroup title="Career DST Stats">
      <StatCell label="Sacks" value={fmtFloat(d?.sacks)} />
      <StatCell label="INT" value={fmt(d?.int)} />
      <StatCell label="Pts Allowed/G" value={fmtFloat(d?.ptsAllowedPerG)} />
    </StatGroup>
  );
}

function OffenseStatsTable({
  pos,
  stats,
}: {
  pos: string;
  stats: FootballPlayerDetailStats;
}) {
  if (pos === 'QB') {
    const p = stats.passing;
    return (
      <StatGroup title="Career Passing">
        <StatCell label="YDS" value={fmt(p?.yds)} />
        <StatCell label="TD" value={fmt(p?.td)} />
        <StatCell label="INT" value={fmt(p?.int)} />
        <StatCell label="RTG" value={fmtFloat(p?.rating)} />
      </StatGroup>
    );
  }

  if (pos === 'RB') {
    const r = stats.rushing;
    return (
      <StatGroup title="Career Rushing">
        <StatCell label="YDS" value={fmt(r?.yds)} />
        <StatCell label="TD" value={fmt(r?.td)} />
      </StatGroup>
    );
  }

  if (pos === 'WR' || pos === 'TE') {
    const r = stats.receiving;
    return (
      <StatGroup title="Career Receiving">
        <StatCell label="REC" value={fmt(r?.rec)} />
        <StatCell label="YDS" value={fmt(r?.yds)} />
        <StatCell label="TD" value={fmt(r?.td)} />
      </StatGroup>
    );
  }

  if (pos === 'K') {
    const k = stats.kicking;
    const fgPct = k?.fga && k.fga > 0 ? ((k.fgm ?? 0) / k.fga) * 100 : null;
    return (
      <StatGroup title="Career Kicking">
        <StatCell label="FGM" value={fmt(k?.fgm)} />
        <StatCell label="FGA" value={fmt(k?.fga)} />
        <StatCell label="FG%" value={fmtFloat(fgPct)} />
      </StatGroup>
    );
  }

  return null;
}

export interface FootballPlayerDetailProps {
  player: FootballPlayerDetailPlayer | null | undefined;
  loading?: boolean;
  error?: boolean;
  /**
   * Called when the back affordance is pressed. Apps supply their own
   * navigation (react-router on web, expo-router on mobile); the component
   * stays platform-agnostic. The back row is hidden when omitted.
   */
  onBack?: () => void;
}

/**
 * Cross-platform NFL player detail view: team-color header swatch, position
 * badge, and position-specific career stat cards (passing / rushing /
 * receiving / kicking / DST / IDP). Data is injected via props so the same
 * component renders on web (react-router) and mobile (expo-router).
 */
export function FootballPlayerDetail({
  player,
  loading,
  error,
  onBack,
}: FootballPlayerDetailProps) {
  const teamData = player?.nflTeam ? NFL_TEAMS[player.nflTeam] : null;
  const isDst = player?.isDst ?? false;
  const isIdp =
    player?.position === 'DL' ||
    player?.position === 'LB' ||
    player?.position === 'DB';

  return (
    <YStack flex={1} backgroundColor={BG_DARK}>
      {/* Back nav */}
      {onBack && (
        <XStack
          paddingHorizontal={16}
          paddingVertical={12}
          alignItems="center"
          gap={8}
          onPress={onBack}
          cursor="pointer"
          pressStyle={{ opacity: 0.7 }}
          hoverStyle={{ opacity: 0.7 }}
        >
          <ArrowLeft size={16} color={TEXT_MUTED} />
          <Text fontSize={14} color={TEXT_MUTED} fontFamily={FONT_BODY}>
            Back to Players
          </Text>
        </XStack>
      )}

      {loading && (
        <YStack
          flex={1}
          alignItems="center"
          justifyContent="center"
          padding={40}
        >
          <Spinner size="large" color={BRAND_GOLD} />
        </YStack>
      )}

      {error && (
        <YStack padding={24}>
          <Text
            color={BRAND_SEAM_RED_LIGHT}
            fontSize={14}
            fontFamily={FONT_BODY}
          >
            Failed to load player. Please try again.
          </Text>
        </YStack>
      )}

      {player && (
        <YStack padding={24} gap={20} maxWidth={640} width="100%">
          {/* Player header */}
          <XStack gap={12} alignItems="center">
            {/* Team color swatch */}
            <YStack
              width={56}
              height={56}
              borderRadius={10}
              backgroundColor={teamData?.primaryColor ?? BRAND_NAVY}
              borderWidth={2}
              borderColor={teamData?.secondaryColor ?? BRAND_GOLD}
              alignItems="center"
              justifyContent="center"
            >
              <Text
                fontSize={isDst ? 9 : 13}
                fontWeight="800"
                color={teamData?.secondaryColor ?? BRAND_GOLD}
                fontFamily={FONT_DISPLAY}
                textAlign="center"
              >
                {player.nflTeam ?? '?'}
              </Text>
            </YStack>

            <YStack flex={1} gap={4}>
              <Text
                fontSize={22}
                fontWeight="800"
                color={TEXT_PRIMARY}
                fontFamily={FONT_DISPLAY}
                letterSpacing={-0.3}
              >
                {[player.firstName, player.lastName].filter(Boolean).join(' ')}
              </Text>
              <XStack gap={8} alignItems="center">
                <YStack
                  paddingHorizontal={8}
                  paddingVertical={3}
                  borderRadius={5}
                  backgroundColor={withAlpha(BRAND_NAVY, 0.4)}
                  borderWidth={1}
                  borderColor={BRAND_NAVY}
                >
                  <Text fontSize={12} fontWeight="700" color={TEXT_PRIMARY}>
                    {isDst ? 'DST' : (player.position ?? '?')}
                  </Text>
                </YStack>
                {player.nflTeam && (
                  <Text fontSize={13} color={TEXT_MUTED} fontFamily={FONT_BODY}>
                    {teamData
                      ? `${teamData.city} · ${player.nflTeam ?? ''}`
                      : (player.nflTeam ?? '')}
                  </Text>
                )}
              </XStack>
            </YStack>
          </XStack>

          {/* Stats */}
          {!player.careerStats ? (
            <YStack
              backgroundColor={SURFACE_CARD}
              borderWidth={1}
              borderColor={OUTLINE_SUBTLE}
              borderRadius={8}
              padding={20}
              alignItems="center"
            >
              <Text fontSize={14} color={TEXT_MUTED} fontFamily={FONT_BODY}>
                No stats available
              </Text>
            </YStack>
          ) : isDst ? (
            <DstStatsTable stats={player.careerStats} />
          ) : isIdp ? (
            <IdpStatsTable stats={player.careerStats} />
          ) : player.position ? (
            <OffenseStatsTable
              pos={player.position}
              stats={player.careerStats}
            />
          ) : null}
        </YStack>
      )}
    </YStack>
  );
}

export default FootballPlayerDetail;
