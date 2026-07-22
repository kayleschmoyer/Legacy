import React, { useState } from 'react';
import { Anchor, Image, Text, XStack, YStack } from 'tamagui';
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
  TEXT_MUTED,
  TEXT_PRIMARY,
  withAlpha,
} from '../../utils/colors';
import { FONT_BODY, FONT_DISPLAY } from '../../utils/typography';
import { PositionBadge } from '../../components/PositionBadge';

/**
 * Portable player shape consumed by {@link FootballPlayerHeader}.
 *
 * Mirrors the fields from the `FootballPlayer` GraphQL fragment that the header
 * needs. Both web and mobile pass their generated query results directly —
 * the generated node is structurally assignable to this interface.
 */
export interface FootballPlayerHeaderPlayer {
  id: number;
  firstName?: string | null;
  lastName?: string | null;
  position?: string | null;
  nflTeam?: string | null;
  isDst?: boolean | null;
  pfrId?: string | null;
  /** Server-computed headshot URL (LS-6456). Preferred over client-side derivation when present. */
  headshotUrl?: string | null;
  previousTeams?: string[];
}

export interface FootballPlayerHeaderProps {
  player: FootballPlayerHeaderPlayer;
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

function getPfrHeadshotUrl(pfrId: string): string {
  return `https://www.pro-football-reference.com/req/20180910/images/headshots/${pfrId}.jpg`;
}

function PlayerAvatar({
  pfrId,
  headshotUrl: headshotUrlProp,
  playerName,
  teamPrimary,
  teamSecondary,
  teamAbbr,
  isDst,
  label,
}: {
  pfrId?: string | null;
  headshotUrl?: string | null;
  playerName: string;
  teamPrimary: string;
  teamSecondary: string;
  teamAbbr: string | null | undefined;
  isDst: boolean;
  label: string;
}) {
  const [imgError, setImgError] = useState(false);
  const derivedUrl =
    headshotUrlProp ?? (pfrId ? getPfrHeadshotUrl(pfrId) : null);
  const headshotUrl = !imgError ? derivedUrl : null;

  return (
    <YStack
      width={72}
      height={72}
      borderRadius={12}
      overflow="hidden"
      backgroundColor={teamPrimary}
      borderWidth={2}
      borderColor={teamSecondary}
      alignItems="center"
      justifyContent="center"
      flexShrink={0}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      aria-label={label}
    >
      {headshotUrl ? (
        <Image
          source={{ uri: headshotUrl }}
          width={72}
          height={72}
          accessibilityLabel={`${playerName} headshot`}
          onError={() => setImgError(true)}
        />
      ) : (
        <Text
          fontSize={isDst ? 11 : 15}
          fontWeight="800"
          color={teamSecondary}
          fontFamily={FONT_DISPLAY}
          textAlign="center"
        >
          {teamAbbr ?? 'FA'}
        </Text>
      )}
    </YStack>
  );
}

function FreeAgentBadge() {
  return (
    <YStack
      paddingHorizontal={8}
      paddingVertical={3}
      borderRadius={5}
      backgroundColor={withAlpha(TEXT_MUTED, 0.1)}
      borderWidth={1}
      borderColor={withAlpha(TEXT_MUTED, 0.3)}
    >
      <Text
        fontSize={12}
        fontWeight="600"
        color={TEXT_MUTED}
        fontFamily={FONT_BODY}
        letterSpacing={0.3}
      >
        Free Agent
      </Text>
    </YStack>
  );
}

/**
 * Football player header for the detail page — headshot (or team-color swatch
 * fallback), player name, position badge, and NFL team with conference/division.
 * Entitlement: all. Platforms: web, mobile-web, android.
 */
export function FootballPlayerHeader({ player }: FootballPlayerHeaderProps) {
  const isDst = player.isDst ?? false;
  const positionLabel = isDst ? 'DST' : (player.position ?? null);
  const teamData = player.nflTeam ? NFL_TEAMS[player.nflTeam] : null;

  const teamPrimary = teamData?.primaryColor ?? BRAND_NAVY;
  const teamSecondary = teamData?.secondaryColor ?? BRAND_GOLD;
  const playerName =
    [player.firstName, player.lastName].filter(Boolean).join(' ') || 'Unknown';
  const teamLabel =
    teamData?.fullName ?? (player.nflTeam ? player.nflTeam : 'Free Agent');

  return (
    <XStack
      gap={16}
      alignItems="center"
      accessible
      accessibilityRole="header"
      accessibilityLabel={[playerName, positionLabel, teamLabel]
        .filter(Boolean)
        .join(', ')}
    >
      <PlayerAvatar
        pfrId={player.pfrId}
        headshotUrl={player.headshotUrl}
        playerName={playerName}
        teamPrimary={teamPrimary}
        teamSecondary={teamSecondary}
        teamAbbr={player.nflTeam}
        isDst={isDst}
        label={teamLabel}
      />

      <YStack flex={1} gap={6}>
        <Text
          fontSize={24}
          fontWeight="800"
          color={TEXT_PRIMARY}
          fontFamily={FONT_DISPLAY}
          letterSpacing={-0.3}
          role="heading"
          aria-level={1}
        >
          {playerName}
        </Text>

        <XStack gap={8} alignItems="center" flexWrap="wrap">
          {positionLabel && (
            <PositionBadge
              position={positionLabel}
              color={getPositionColor(positionLabel)}
              showBorder
              paddingHorizontal={8}
              paddingVertical={3}
              borderRadius={5}
              fontSize={12}
              fontFamily={FONT_BODY}
              letterSpacing={0.5}
            />
          )}
          {!player.nflTeam && <FreeAgentBadge />}
          {player.pfrId && (
            <Anchor
              href={`https://www.pro-football-reference.com/players/${player.pfrId[0]}/${player.pfrId}.htm`}
              target="_blank"
              rel="noopener noreferrer"
              fontSize={12}
              color={TEXT_MUTED}
              fontFamily={FONT_BODY}
            >
              PFR ↗
            </Anchor>
          )}
        </XStack>

        {teamData && (
          <YStack gap={2}>
            <Text fontSize={14} color={TEXT_PRIMARY} fontFamily={FONT_BODY}>
              {teamData.fullName}
            </Text>
            <XStack gap={4} alignItems="center" flexWrap="wrap">
              <YStack
                paddingHorizontal={6}
                paddingVertical={2}
                borderRadius={4}
                backgroundColor={SURFACE_CARD}
                borderWidth={1}
                borderColor={OUTLINE_SUBTLE}
              >
                <Text fontSize={11} color={TEXT_MUTED} fontFamily={FONT_BODY}>
                  {teamData.conference}
                </Text>
              </YStack>
              <Text fontSize={11} color={TEXT_MUTED} fontFamily={FONT_BODY}>
                {teamData.division}
              </Text>
              {player.previousTeams && player.previousTeams.length > 0 && (
                <Text fontSize={11} color={TEXT_MUTED} fontFamily={FONT_BODY}>
                  {`previously: ${player.previousTeams.join(', ')}`}
                </Text>
              )}
            </XStack>
          </YStack>
        )}
      </YStack>
    </XStack>
  );
}

export default FootballPlayerHeader;
