import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Spinner, Text, XStack, YStack } from 'tamagui';
import { ArrowLeft } from '@tamagui/lucide-icons';
import { NFL_TEAMS } from '@legacy-sports/shared-components';
import { useFootballPlayerQuery } from '../../api/db/graphql.generated';
import { PageMeta } from '../../components/PageMeta';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_NAVY,
  OUTLINE_SUBTLE,
  SURFACE_CARD,
  TEXT_MUTED,
  TEXT_PRIMARY,
  withAlpha,
} from '../../constants/colors';
import { FONT_BODY, FONT_DISPLAY } from '../../constants/typography';

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

function IdpStatsTable({
  stats,
}: {
  stats: NonNullable<
    NonNullable<
      ReturnType<typeof useFootballPlayerQuery>['data']
    >['footballPlayer']
  >['careerStats'];
}) {
  const idp = stats?.idp;
  return (
    <YStack gap={8}>
      <Text
        fontSize={13}
        color={TEXT_MUTED}
        fontFamily={FONT_BODY}
        fontWeight="600"
      >
        Career IDP Stats
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
        <StatCell label="Solo" value={fmt(idp?.soloTkl)} />
        <StatCell label="Ast" value={fmt(idp?.astTkl)} />
        <StatCell label="Sacks" value={fmtFloat(idp?.sacks)} />
        <StatCell label="INT" value={fmt(idp?.int)} />
        <StatCell label="FF" value={fmt(idp?.ff)} />
      </XStack>
    </YStack>
  );
}

function DstStatsTable({
  stats,
}: {
  stats: NonNullable<
    NonNullable<
      ReturnType<typeof useFootballPlayerQuery>['data']
    >['footballPlayer']
  >['careerStats'];
}) {
  const d = stats?.defense;
  return (
    <YStack gap={8}>
      <Text
        fontSize={13}
        color={TEXT_MUTED}
        fontFamily={FONT_BODY}
        fontWeight="600"
      >
        Career DST Stats
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
        <StatCell label="Sacks" value={fmtFloat(d?.sacks)} />
        <StatCell label="INT" value={fmt(d?.int)} />
        <StatCell label="Pts Allowed/G" value={fmtFloat(d?.ptsAllowedPerG)} />
      </XStack>
    </YStack>
  );
}

function OffenseStatsTable({
  pos,
  stats,
}: {
  pos: string;
  stats: NonNullable<
    NonNullable<
      ReturnType<typeof useFootballPlayerQuery>['data']
    >['footballPlayer']
  >['careerStats'];
}) {
  if (pos === 'QB') {
    const p = stats?.passing;
    return (
      <YStack gap={8}>
        <Text
          fontSize={13}
          color={TEXT_MUTED}
          fontFamily={FONT_BODY}
          fontWeight="600"
        >
          Career Passing
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
          <StatCell label="YDS" value={fmt(p?.yds)} />
          <StatCell label="TD" value={fmt(p?.td)} />
          <StatCell label="INT" value={fmt(p?.int)} />
          <StatCell label="RTG" value={fmtFloat(p?.rating)} />
        </XStack>
      </YStack>
    );
  }

  if (pos === 'RB') {
    const r = stats?.rushing;
    return (
      <YStack gap={8}>
        <Text
          fontSize={13}
          color={TEXT_MUTED}
          fontFamily={FONT_BODY}
          fontWeight="600"
        >
          Career Rushing
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
          <StatCell label="YDS" value={fmt(r?.yds)} />
          <StatCell label="TD" value={fmt(r?.td)} />
        </XStack>
      </YStack>
    );
  }

  if (pos === 'WR' || pos === 'TE') {
    const r = stats?.receiving;
    return (
      <YStack gap={8}>
        <Text
          fontSize={13}
          color={TEXT_MUTED}
          fontFamily={FONT_BODY}
          fontWeight="600"
        >
          Career Receiving
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
          <StatCell label="REC" value={fmt(r?.rec)} />
          <StatCell label="YDS" value={fmt(r?.yds)} />
          <StatCell label="TD" value={fmt(r?.td)} />
        </XStack>
      </YStack>
    );
  }

  if (pos === 'K') {
    const k = stats?.kicking;
    const fgPct = k?.fga && k.fga > 0 ? ((k.fgm ?? 0) / k.fga) * 100 : null;
    return (
      <YStack gap={8}>
        <Text
          fontSize={13}
          color={TEXT_MUTED}
          fontFamily={FONT_BODY}
          fontWeight="600"
        >
          Career Kicking
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
          <StatCell label="FGM" value={fmt(k?.fgm)} />
          <StatCell label="FGA" value={fmt(k?.fga)} />
          <StatCell label="FG%" value={fmtFloat(fgPct)} />
        </XStack>
      </YStack>
    );
  }

  return null;
}

export function FootballPlayerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const playerId = id ? parseInt(id, 10) : 0;

  const { data, loading, error } = useFootballPlayerQuery({
    variables: { id: playerId },
    skip: !playerId,
  });

  const player = data?.footballPlayer;
  const teamData = player?.nflTeam ? NFL_TEAMS[player.nflTeam] : null;
  const isDst = player?.isDst ?? false;
  const isIdp =
    player?.position === 'DL' ||
    player?.position === 'LB' ||
    player?.position === 'DB';

  return (
    <YStack flex={1} backgroundColor={BG_DARK} minHeight="100vh">
      <PageMeta
        title={
          [player?.firstName, player?.lastName].filter(Boolean).join(' ') ||
          'Player'
        }
        description={`${player?.position ?? 'Football player'} — ${player?.nflTeam ?? ''}`}
      />

      {/* Back nav */}
      <XStack
        paddingHorizontal={16}
        paddingVertical={12}
        alignItems="center"
        gap={8}
        onPress={() => navigate(-1)}
        cursor="pointer"
        hoverStyle={{ opacity: 0.7 }}
      >
        <ArrowLeft size={16} color={TEXT_MUTED} />
        <Text fontSize={14} color={TEXT_MUTED} fontFamily={FONT_BODY}>
          Back to Players
        </Text>
      </XStack>

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
          <Text color="#E63950" fontSize={14}>
            Failed to load player. Please try again.
          </Text>
        </YStack>
      )}

      {player && (
        <YStack padding={24} gap={20} maxWidth={640}>
          {/* Player header */}
          <YStack gap={8}>
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
                  {[player.firstName, player.lastName]
                    .filter(Boolean)
                    .join(' ')}
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
                    <Text
                      fontSize={13}
                      color={TEXT_MUTED}
                      fontFamily={FONT_BODY}
                    >
                      {teamData
                        ? `${teamData.city} · ${player.nflTeam ?? ''}`
                        : (player.nflTeam ?? '')}
                    </Text>
                  )}
                </XStack>
              </YStack>
            </XStack>
          </YStack>

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

export default FootballPlayerDetailPage;
