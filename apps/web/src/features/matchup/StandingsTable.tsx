import React, { useMemo, useState } from 'react';
import { Card, H3, Separator, Text, XStack, YStack } from 'tamagui';
import { BRAND_GOLD_LIGHT } from '../../constants/colors';
import { type GetLeagueStandingsQuery } from '../../api/db/graphql.generated';
import { AvatarImage } from '../../components/common';

type StandingRecord = NonNullable<
  GetLeagueStandingsQuery['getLeagueStandings']
>[0];

export interface StandingsTableProps {
  standings: StandingRecord[];
  loading?: boolean;
  error?: Error | null;
}

type SortKey =
  | 'team'
  | 'wins'
  | 'losses'
  | 'winPct'
  | 'pointsFor'
  | 'pointsAgainst';
type SortDirection = 'asc' | 'desc';

function sortStandings(
  list: StandingRecord[],
  sortKey: SortKey,
  sortDirection: SortDirection,
): StandingRecord[] {
  return [...list].sort((a, b) => {
    let aValue: number | string;
    let bValue: number | string;

    switch (sortKey) {
      case 'team':
        aValue = a.teamName ?? '';
        bValue = b.teamName ?? '';
        break;
      case 'wins':
        aValue = a.wins ?? 0;
        bValue = b.wins ?? 0;
        break;
      case 'losses':
        aValue = a.losses ?? 0;
        bValue = b.losses ?? 0;
        break;
      case 'winPct':
        aValue = a.winPercentage ?? 0;
        bValue = b.winPercentage ?? 0;
        break;
      case 'pointsFor':
        aValue = a.pointsFor ?? 0;
        bValue = b.pointsFor ?? 0;
        break;
      case 'pointsAgainst':
        aValue = a.pointsAgainst ?? 0;
        bValue = b.pointsAgainst ?? 0;
        break;
      default:
        return 0;
    }

    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });
}

interface StandingsRowProps {
  standing: StandingRecord;
  index: number;
}

function StandingsRow({ standing, index }: StandingsRowProps) {
  return (
    <XStack
      key={standing.teamId}
      paddingVertical="$3"
      paddingHorizontal="$3"
      backgroundColor={index % 2 === 0 ? '$background' : '$gray2'}
      gap="$2"
    >
      <YStack flex={1} minWidth={120} justifyContent="center">
        <XStack gap="$2" alignItems="center">
          <AvatarImage
            url={standing.avatarUrl}
            username={standing.teamName}
            size={32}
            borderRadius={4}
          />
          <Text fontSize="$3" fontWeight="600">
            {standing.teamName ?? `Team ${standing.teamId}`}
          </Text>
        </XStack>
      </YStack>
      <YStack width={50} alignItems="center">
        <Text fontSize="$3" color="$green10" fontWeight="bold">
          {standing.wins ?? 0}
        </Text>
      </YStack>
      <YStack width={50} alignItems="center">
        <Text fontSize="$3" color="$red10" fontWeight="bold">
          {standing.losses ?? 0}
        </Text>
      </YStack>
      <YStack
        width={60}
        alignItems="center"
        display="none"
        $gtSm={{ display: 'flex' }}
      >
        <Text fontSize="$3">
          {((standing.winPercentage ?? 0) * 100).toFixed(1)}%
        </Text>
      </YStack>
      <YStack
        width={80}
        alignItems="center"
        display="none"
        $gtMd={{ display: 'flex' }}
      >
        <Text fontSize="$3">{(standing.pointsFor ?? 0).toFixed(2)}</Text>
      </YStack>
      <YStack
        width={80}
        alignItems="center"
        display="none"
        $gtMd={{ display: 'flex' }}
      >
        <Text fontSize="$3">{(standing.pointsAgainst ?? 0).toFixed(2)}</Text>
      </YStack>
    </XStack>
  );
}

/**
 * StandingsTable - Sortable league standings table
 * Supports division grouping when teams have divisionId set.
 * Responsive design with mobile-friendly layout.
 */
export function StandingsTable({
  standings,
  loading = false,
  error = null,
}: StandingsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('winPct');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection(key === 'team' ? 'asc' : 'desc');
    }
  };

  // Determine if divisions are enabled — true when any team has a non-null divisionId
  const hasDivisions = useMemo(
    () => standings.some((s) => s.divisionId != null),
    [standings],
  );

  // Build division groups when divisions are enabled, sorted by divisionId then sort key
  const divisionGroups = useMemo(() => {
    if (!hasDivisions) return null;

    const uniqueIds = Array.from(
      new Set(standings.map((s) => s.divisionId ?? 0)),
    ).sort((a, b) => a - b);

    return uniqueIds.map((divId) => {
      const divTeams = standings.filter((s) => (s.divisionId ?? 0) === divId);
      return {
        divisionId: divId,
        teams: sortStandings(divTeams, sortKey, sortDirection),
      };
    });
  }, [hasDivisions, standings, sortKey, sortDirection]);

  const sortedStandings = useMemo(
    () =>
      hasDivisions ? [] : sortStandings(standings, sortKey, sortDirection),
    [hasDivisions, standings, sortKey, sortDirection],
  );

  if (loading) {
    return (
      <Card padding="$4">
        <Text color="$gray11">Loading standings...</Text>
      </Card>
    );
  }

  if (error) {
    return (
      <Card padding="$4">
        <Text color="$red10">Error: {error.message}</Text>
      </Card>
    );
  }

  if (standings.length === 0) {
    return (
      <Card padding="$4">
        <Text color="$gray11">No standings available</Text>
      </Card>
    );
  }

  const SortButton = ({
    label,
    sortKeyValue,
  }: {
    label: string;
    sortKeyValue: SortKey;
  }) => (
    <Text
      fontSize="$3"
      fontWeight="bold"
      color={sortKey === sortKeyValue ? BRAND_GOLD_LIGHT : '$gray11'}
      cursor="pointer"
      onPress={() => handleSort(sortKeyValue)}
      userSelect="none"
    >
      {label}{' '}
      {sortKey === sortKeyValue && (sortDirection === 'asc' ? '↑' : '↓')}
    </Text>
  );

  const HeaderRow = () => (
    <XStack
      paddingVertical="$2"
      paddingHorizontal="$3"
      borderBottomWidth={1}
      borderBottomColor="$gray6"
      gap="$2"
    >
      <YStack flex={1} minWidth={120}>
        <SortButton label="Team" sortKeyValue="team" />
      </YStack>
      <YStack width={50} alignItems="center">
        <SortButton label="W" sortKeyValue="wins" />
      </YStack>
      <YStack width={50} alignItems="center">
        <SortButton label="L" sortKeyValue="losses" />
      </YStack>
      <YStack
        width={60}
        alignItems="center"
        display="none"
        $gtSm={{ display: 'flex' }}
      >
        <SortButton label="Win%" sortKeyValue="winPct" />
      </YStack>
      <YStack
        width={80}
        alignItems="center"
        display="none"
        $gtMd={{ display: 'flex' }}
      >
        <SortButton label="PF" sortKeyValue="pointsFor" />
      </YStack>
      <YStack
        width={80}
        alignItems="center"
        display="none"
        $gtMd={{ display: 'flex' }}
      >
        <SortButton label="PA" sortKeyValue="pointsAgainst" />
      </YStack>
    </XStack>
  );

  return (
    <Card elevate bordered padding="$4" width="100%" maxWidth={900}>
      <H3 marginBottom="$3">League Standings</H3>
      <Separator marginBottom="$3" />

      {hasDivisions && divisionGroups ? (
        /* Division view — render a section per division */
        <YStack gap="$4">
          {divisionGroups.map((group) => (
            <YStack key={group.divisionId}>
              {/* Division header */}
              <XStack
                paddingVertical="$2"
                paddingHorizontal="$3"
                backgroundColor="$gray3"
                borderRadius="$2"
                marginBottom="$1"
              >
                <Text fontSize="$3" fontWeight="700" color="$gray11">
                  Division {group.divisionId}
                </Text>
              </XStack>

              {/* Column headers */}
              <HeaderRow />

              {/* Team rows */}
              <YStack>
                {group.teams.map((standing, index) => (
                  <StandingsRow
                    key={standing.teamId}
                    standing={standing}
                    index={index}
                  />
                ))}
              </YStack>
            </YStack>
          ))}
        </YStack>
      ) : (
        /* Standard view — single sorted list */
        <>
          <HeaderRow />
          <YStack>
            {sortedStandings.map((standing, index) => (
              <StandingsRow
                key={standing.teamId}
                standing={standing}
                index={index}
              />
            ))}
          </YStack>
        </>
      )}
    </Card>
  );
}
