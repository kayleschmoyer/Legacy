import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { XStack, YStack } from '@legacy-sports/shared-components';
import { Card, Separator, Spinner, styled, Text } from 'tamagui';
import { Trophy } from '@tamagui/lucide-icons';
import { useStandings } from '../../hooks/useStandings';
import {
  AMBER,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  GRADIENT_ACCENT_AMBER,
  SURFACE_PANEL,
  SURFACE_SUBTLE,
  withAlpha,
} from '../../constants/colors';
import { AvatarImage } from '../../components/common';

interface Team {
  id: number;
  name: string;
  leagueId: number;
  waiverOrder?: number | null;
  faabBudget?: number | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
}

export interface LeagueStandingsProps {
  leagueId: number;
  teams: readonly Team[];
  loading?: boolean;
  userTeamId?: number | null;
  waiverType?: string | null;
  /** When provided, called instead of navigating to the team detail page */
  onTeamClick?: (teamId: number) => void;
}

const RankBadge = styled(YStack, {
  width: 32,
  height: 32,
  borderRadius: 16,
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  animation: 'quick',
  hoverStyle: { scale: 1.12 },
});

function getRankStyle(rank: number) {
  switch (rank) {
    case 1:
      return { bg: '$amber3', border: '$amber7', color: '$amber11' };
    case 2:
      return { bg: '$gray3', border: '$gray7', color: '$gray11' };
    case 3:
      return { bg: '$amber3', border: '$amber8', color: '$amber11' };
    default:
      return {
        bg: '$surfaceSubtle',
        border: '$outlineSubtle',
        color: '$textMuted',
      };
  }
}

export function LeagueStandings({
  leagueId,
  teams,
  loading = false,
  userTeamId,
  waiverType,
  onTeamClick,
}: LeagueStandingsProps): React.JSX.Element {
  const navigate = useNavigate();
  const { standings, loading: standingsLoading } = useStandings(leagueId);

  // Merge teams with standings data, sorted by standings rank
  const rankedTeams = useMemo(() => {
    if (standings.length === 0) {
      // No standings data yet — show teams in their original order
      return teams.map((t) => ({
        ...t,
        logoUrl: t.logoUrl ?? null,
        primaryColor: t.primaryColor ?? null,
        secondaryColor: t.secondaryColor ?? null,
        wins: null as number | null,
        losses: null as number | null,
        ties: null as number | null,
        winPercentage: null as number | null,
        pointsFor: null as number | null,
        pointsAgainst: null as number | null,
        divisionId: null as number | null,
      }));
    }
    // Build a map from teamId → standings record
    const standingsMap = new Map(standings.map((s) => [String(s.teamId), s]));
    const teamsMap = new Map(teams.map((t) => [String(t.id), t]));

    // Start from standings order (already sorted by winPct, pointsFor)
    const merged = standings.map((s) => {
      const team = teamsMap.get(String(s.teamId));
      return {
        id: team?.id ?? parseInt(String(s.teamId ?? '0'), 10),
        name: team?.name ?? s.teamName ?? 'Unknown',
        leagueId: team?.leagueId ?? leagueId,
        waiverOrder: team?.waiverOrder ?? null,
        faabBudget: team?.faabBudget ?? null,
        logoUrl: team?.logoUrl ?? null,
        primaryColor: team?.primaryColor ?? null,
        secondaryColor: team?.secondaryColor ?? null,
        wins: s.wins ?? null,
        losses: s.losses ?? null,
        ties: s.ties ?? null,
        winPercentage: s.winPercentage ?? null,
        pointsFor: s.pointsFor ?? null,
        pointsAgainst: s.pointsAgainst ?? null,
        divisionId: s.divisionId ?? null,
      };
    });

    // Append any teams not in standings (e.g. newly added)
    for (const team of teams) {
      if (!standingsMap.has(String(team.id))) {
        merged.push({
          ...team,
          waiverOrder: team.waiverOrder ?? null,
          faabBudget: team.faabBudget ?? null,
          logoUrl: team.logoUrl ?? null,
          primaryColor: team.primaryColor ?? null,
          secondaryColor: team.secondaryColor ?? null,
          wins: null,
          losses: null,
          ties: null,
          winPercentage: null,
          pointsFor: null,
          pointsAgainst: null,
          divisionId: null,
        });
      }
    }

    return merged;
  }, [teams, standings, leagueId]);

  // Group teams by division when multiple divisions exist
  const divisionGroups = useMemo(() => {
    const uniqueDivisions = new Set(
      rankedTeams
        .map((t) => t.divisionId)
        .filter((d): d is number => d != null),
    );
    // If 0 or 1 division, no grouping needed
    if (uniqueDivisions.size <= 1) return null;

    const groups = new Map<number, typeof rankedTeams>();
    for (const team of rankedTeams) {
      const divId = team.divisionId ?? 0;
      const group = groups.get(divId) ?? [];
      group.push(team);
      groups.set(divId, group);
    }
    // Return sorted by division ID
    return [...groups.entries()].sort(([a], [b]) => a - b);
  }, [rankedTeams]);

  const isLoading = loading || standingsLoading;

  const handleTeamClick = (teamId: number) => {
    if (onTeamClick) {
      onTeamClick(teamId);
    } else {
      navigate(`/baseball/team/${teamId}`);
    }
  };

  type RankedTeam = (typeof rankedTeams)[number];

  const renderTeamRow = (team: RankedTeam, index: number, total: number) => {
    const isUserTeam = userTeamId === team.id;
    const rank = index + 1;
    // Only show rank numbers and award gold/silver/bronze styles when this
    // specific team has a standings record (post-season-start). During the
    // preseason, appended teams have null record fields and must not render
    // numeric ranks or top-3 glow regardless of the global standings array.
    const hasStandingsRecord = team.wins != null;
    const rankStyle = hasStandingsRecord
      ? getRankStyle(rank)
      : { bg: '$surfaceSubtle', border: '$outlineSubtle', color: '$textMuted' };
    const isEven = index % 2 === 0;

    return (
      <React.Fragment key={team.id}>
        <XStack
          paddingHorizontal="$4"
          paddingVertical="$2.5"
          backgroundColor={
            isUserTeam
              ? withAlpha(BRAND_NAVY_LIGHT, 0.12)
              : isEven
                ? '$background'
                : '$surfaceSubtle'
          }
          borderLeftWidth={3}
          borderLeftColor={isUserTeam ? BRAND_NAVY_LIGHT : 'transparent'}
          role="listitem"
          cursor="pointer"
          hoverStyle={{
            backgroundColor: isUserTeam
              ? withAlpha(BRAND_NAVY_LIGHT, 0.18)
              : '$surfaceSubtle',
          }}
          pressStyle={{ scale: 0.995, opacity: 0.9 }}
          onPress={() => handleTeamClick(team.id)}
          alignItems="center"
          animation="quick"
          minHeight={48}
          style={
            isUserTeam
              ? {
                  boxShadow: `inset 0 0 24px ${withAlpha(BRAND_NAVY_LIGHT, 0.1)}`,
                }
              : hasStandingsRecord && rank <= 3
                ? {
                    boxShadow: `inset 0 0 20px ${withAlpha(AMBER, 0.06)}`,
                  }
                : undefined
          }
        >
          {/* Rank */}
          <YStack width={44} alignItems="flex-start">
            <RankBadge
              backgroundColor={rankStyle.bg}
              borderColor={rankStyle.border}
              borderWidth={1}
            >
              <Text fontSize="$2" fontWeight="800" color={rankStyle.color}>
                {hasStandingsRecord ? rank : '—'}
              </Text>
            </RankBadge>
          </YStack>

          {/* Team info */}
          <YStack flex={2} gap="$0.5">
            <XStack alignItems="center" gap="$2">
              <AvatarImage
                url={team.logoUrl}
                username={team.name}
                size={24}
                borderRadius={4}
              />
              <Text
                fontSize="$3"
                fontWeight={isUserTeam ? '700' : '500'}
                color="$color"
                numberOfLines={1}
              >
                {team.name}
              </Text>
              {isUserTeam && (
                <Text
                  fontSize={10}
                  fontWeight="800"
                  color={BRAND_GOLD_LIGHT}
                  backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.18)}
                  paddingHorizontal="$1.5"
                  paddingVertical={1}
                  borderRadius="$2"
                >
                  YOU
                </Text>
              )}
            </XStack>
          </YStack>

          {/* Waiver Info */}
          <Text
            width={60}
            fontSize="$3"
            fontWeight="500"
            color="$textMuted"
            textAlign="center"
            display="none"
            $gtSm={{ display: 'flex' }}
          >
            {waiverType === 'faab'
              ? team.faabBudget != null
                ? `$${team.faabBudget}`
                : '—'
              : team.waiverOrder != null
                ? `#${team.waiverOrder}`
                : '—'}
          </Text>

          {/* Record (W-L-T) */}
          <Text
            width={80}
            fontSize="$3"
            fontWeight="600"
            color="$color"
            textAlign="center"
          >
            {team.wins != null
              ? `${team.wins}-${team.losses ?? 0}${team.ties ? `-${team.ties}` : ''}`
              : '—'}
          </Text>

          {/* Points */}
          <Text
            width={70}
            fontSize="$3"
            fontWeight="600"
            color="$textMuted"
            textAlign="right"
          >
            {team.pointsFor != null
              ? (Math.round(team.pointsFor * 10) / 10).toLocaleString()
              : '—'}
          </Text>
        </XStack>
        {index < total - 1 && (
          <Separator borderColor="$outlineSubtle" marginVertical={0} />
        )}
      </React.Fragment>
    );
  };

  if (isLoading) {
    return (
      <YStack
        padding="$6"
        alignItems="center"
        gap="$3"
        role="status"
        aria-live="polite"
      >
        <Spinner size="large" color={BRAND_NAVY_LIGHT} />
        <Text color="$textMuted" fontSize="$4">
          Loading standings...
        </Text>
      </YStack>
    );
  }

  if (!teams || teams.length === 0) {
    return (
      <Card
        backgroundColor="$surfacePanel"
        borderColor="$surfacePanelBorder"
        borderWidth={1}
        borderRadius="$6"
        padding="$8"
        alignItems="center"
      >
        <YStack alignItems="center" gap="$3">
          <Trophy size={32} color="var(--textMuted)" />
          <Text color="$textMuted" fontSize="$5" fontWeight="600">
            No teams yet
          </Text>
          <Text color="$textMuted" fontSize="$3" textAlign="center">
            Teams will appear here once managers join the league.
          </Text>
        </YStack>
      </Card>
    );
  }

  return (
    <Card
      backgroundColor={withAlpha(SURFACE_PANEL, 0.7)}
      borderColor="$surfacePanelBorder"
      borderWidth={1}
      borderRadius="$5"
      overflow="hidden"
      role="region"
      aria-label="League standings"
      style={{
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      {/* Gradient accent bar */}
      <YStack
        height={3}
        width="100%"
        style={{
          background: GRADIENT_ACCENT_AMBER,
        }}
      />
      {/* Title bar */}
      <XStack
        paddingHorizontal="$4"
        paddingVertical="$3"
        justifyContent="space-between"
        alignItems="center"
        backgroundColor={withAlpha(SURFACE_SUBTLE, 0.6)}
      >
        <XStack alignItems="center" gap="$2">
          <Trophy size={18} color="var(--color)" />
          <Text
            fontSize="$4"
            fontWeight="700"
            color="$color"
            id="standings-title"
          >
            Standings
          </Text>
        </XStack>
        <Text fontSize="$2" color="$textMuted">
          {rankedTeams.length} {rankedTeams.length === 1 ? 'team' : 'teams'}
        </Text>
      </XStack>

      {/* Table Header - only when no divisions; divisions render their own headers */}
      {!divisionGroups && (
        <XStack
          paddingHorizontal="$4"
          paddingVertical="$2"
          borderBottomWidth={1}
          borderBottomColor="$outlineSubtle"
        >
          <Text
            width={44}
            fontSize="$1"
            color="$textMuted"
            fontWeight="700"
            textTransform="uppercase"
            letterSpacing={0.6}
          >
            #
          </Text>
          <Text
            flex={2}
            fontSize="$1"
            color="$textMuted"
            fontWeight="700"
            textTransform="uppercase"
            letterSpacing={0.6}
          >
            Team
          </Text>
          <Text
            width={60}
            fontSize="$1"
            color="$textMuted"
            fontWeight="700"
            textTransform="uppercase"
            letterSpacing={0.6}
            textAlign="center"
            display="none"
            $gtSm={{ display: 'flex' }}
          >
            {waiverType === 'faab' ? 'FAAB' : 'Waiver'}
          </Text>
          <Text
            width={80}
            fontSize="$1"
            color="$textMuted"
            fontWeight="700"
            textTransform="uppercase"
            letterSpacing={0.6}
            textAlign="center"
          >
            Record
          </Text>
          <Text
            width={70}
            fontSize="$1"
            color="$textMuted"
            fontWeight="700"
            textTransform="uppercase"
            letterSpacing={0.6}
            textAlign="right"
          >
            Points
          </Text>
        </XStack>
      )}

      {/* Team Rows */}
      {divisionGroups ? (
        <XStack alignItems="flex-start" overflow="hidden">
          {divisionGroups.map(([divId, divTeams], groupIdx) => (
            <YStack
              key={divId}
              flex={1}
              role="list"
              borderRightWidth={groupIdx < divisionGroups.length - 1 ? 1 : 0}
              borderRightColor="$outlineSubtle"
            >
              {/* Division Header */}
              <XStack
                paddingHorizontal="$4"
                paddingVertical="$2"
                backgroundColor={withAlpha(SURFACE_SUBTLE, 0.8)}
                borderBottomWidth={1}
                borderBottomColor="$outlineSubtle"
              >
                <Text
                  fontSize="$2"
                  fontWeight="800"
                  color="$textMuted"
                  textTransform="uppercase"
                  letterSpacing={0.8}
                >
                  Division {divId}
                </Text>
                <Text fontSize="$2" color="$textMuted" marginLeft="$2">
                  ({divTeams.length} {divTeams.length === 1 ? 'team' : 'teams'})
                </Text>
              </XStack>
              {/* Per-division column header */}
              <XStack
                paddingHorizontal="$4"
                paddingVertical="$2"
                borderBottomWidth={1}
                borderBottomColor="$outlineSubtle"
              >
                <Text
                  width={44}
                  fontSize="$1"
                  color="$textMuted"
                  fontWeight="700"
                  textTransform="uppercase"
                  letterSpacing={0.6}
                >
                  #
                </Text>
                <Text
                  flex={2}
                  fontSize="$1"
                  color="$textMuted"
                  fontWeight="700"
                  textTransform="uppercase"
                  letterSpacing={0.6}
                >
                  Team
                </Text>
                <Text
                  width={60}
                  fontSize="$1"
                  color="$textMuted"
                  fontWeight="700"
                  textTransform="uppercase"
                  letterSpacing={0.6}
                  textAlign="center"
                  display="none"
                  $gtSm={{ display: 'flex' }}
                >
                  {waiverType === 'faab' ? 'FAAB' : 'Waiver'}
                </Text>
                <Text
                  width={80}
                  fontSize="$1"
                  color="$textMuted"
                  fontWeight="700"
                  textTransform="uppercase"
                  letterSpacing={0.6}
                  textAlign="center"
                >
                  Record
                </Text>
                <Text
                  width={70}
                  fontSize="$1"
                  color="$textMuted"
                  fontWeight="700"
                  textTransform="uppercase"
                  letterSpacing={0.6}
                  textAlign="right"
                >
                  Points
                </Text>
              </XStack>
              {divTeams.map((team, index) =>
                renderTeamRow(team, index, divTeams.length),
              )}
            </YStack>
          ))}
        </XStack>
      ) : (
        <YStack role="list">
          {rankedTeams.map((team, index) =>
            renderTeamRow(team, index, rankedTeams.length),
          )}
        </YStack>
      )}
    </Card>
  );
}
