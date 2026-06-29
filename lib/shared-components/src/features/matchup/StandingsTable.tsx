import React, { useMemo, useState } from 'react';
import { Card, H3, Separator, Text, XStack, YStack } from 'tamagui';
import { type GetLeagueStandingsQuery } from '@legacy-sports/graphql';
import { BRAND_GOLD, BRAND_GOLD_LIGHT, withAlpha } from '../../utils/colors';
import { AvatarImage } from '../../components/AvatarImage';

type StandingRecord = NonNullable<
  GetLeagueStandingsQuery['getLeagueStandings']
>[0];

export interface StandingsTableProps {
  standings: StandingRecord[];
  loading?: boolean;
  error?: Error | null;
  /**
   * When set, the matching team's row is highlighted and tagged with a "You"
   * chip. Compared against `Number(standing.teamId)`.
   */
  currentUserTeamId?: number | null;
  /** Row press handler — invoked with the numeric team id when a row is tapped. */
  onTeamPress?: (teamId: number) => void;
  /** Header title (defaults to "League Standings"). */
  title?: string;
  /** Optional subtitle rendered under the title. */
  subtitle?: string;
}

type SortKey =
  | 'team'
  | 'wins'
  | 'losses'
  | 'ties'
  | 'winPct'
  | 'pointsFor'
  | 'pointsAgainst'
  | 'diff';
type SortDirection = 'asc' | 'desc';

const diffOf = (s: StandingRecord): number | null =>
  s.pointsFor != null && s.pointsAgainst != null
    ? s.pointsFor - s.pointsAgainst
    : null;

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
      case 'ties':
        aValue = a.ties ?? 0;
        bValue = b.ties ?? 0;
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
      case 'diff':
        aValue = diffOf(a) ?? 0;
        bValue = diffOf(b) ?? 0;
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
  rank: number;
  isCurrentUser: boolean;
  onTeamPress?: (teamId: number) => void;
}

function StandingsRow({
  standing,
  index,
  rank,
  isCurrentUser,
  onTeamPress,
}: StandingsRowProps) {
  const teamId = standing.teamId != null ? Number(standing.teamId) : null;
  const pressable = onTeamPress != null && teamId != null;
  const diff = diffOf(standing);
  const diffColor =
    diff == null
      ? undefined
      : diff > 0
        ? '$green10'
        : diff < 0
          ? '$red10'
          : undefined;

  return (
    <XStack
      key={standing.teamId}
      tag="tr"
      role="row"
      paddingVertical="$3"
      paddingHorizontal="$3"
      backgroundColor={
        isCurrentUser
          ? withAlpha(BRAND_GOLD, 0.12)
          : index % 2 === 0
            ? '$background'
            : '$gray2'
      }
      gap="$2"
      cursor={pressable ? 'pointer' : undefined}
      hoverStyle={pressable ? { backgroundColor: '$gray3' } : undefined}
      onPress={pressable ? () => onTeamPress(teamId) : undefined}
    >
      <YStack
        tag="td"
        role="cell"
        width={44}
        alignItems="center"
        justifyContent="center"
      >
        <Text fontSize="$3" fontWeight="bold" color="$gray11">
          {rank}
        </Text>
      </YStack>
      <YStack
        tag="td"
        role="cell"
        flex={1}
        minWidth={120}
        justifyContent="center"
      >
        <XStack gap="$2" alignItems="center">
          <AvatarImage
            url={standing.avatarUrl}
            username={standing.teamName}
            size={32}
            borderRadius={4}
          />
          <Text
            fontSize="$3"
            fontWeight="600"
            color={isCurrentUser ? BRAND_GOLD_LIGHT : undefined}
          >
            {standing.teamName ?? `Team ${standing.teamId}`}
          </Text>
          {isCurrentUser ? (
            <Text
              fontSize="$1"
              fontWeight="700"
              color={BRAND_GOLD_LIGHT}
              borderColor={BRAND_GOLD_LIGHT}
              borderWidth={1}
              borderRadius="$2"
              paddingHorizontal="$1.5"
            >
              You
            </Text>
          ) : null}
        </XStack>
      </YStack>
      <YStack tag="td" role="cell" width={44} alignItems="center">
        <Text fontSize="$3" color="$green10" fontWeight="bold">
          {standing.wins ?? 0}
        </Text>
      </YStack>
      <YStack tag="td" role="cell" width={44} alignItems="center">
        <Text fontSize="$3" color="$red10" fontWeight="bold">
          {standing.losses ?? 0}
        </Text>
      </YStack>
      <YStack
        tag="td"
        role="cell"
        width={44}
        alignItems="center"
        display="none"
        $gtSm={{ display: 'flex' }}
      >
        <Text fontSize="$3">{standing.ties ?? 0}</Text>
      </YStack>
      <YStack
        tag="td"
        role="cell"
        width={60}
        alignItems="center"
        display="none"
        $gtSm={{ display: 'flex' }}
      >
        <Text fontSize="$3" fontWeight="600">
          {((standing.winPercentage ?? 0) * 100).toFixed(1)}%
        </Text>
      </YStack>
      <YStack
        tag="td"
        role="cell"
        width={80}
        alignItems="center"
        display="none"
        $gtMd={{ display: 'flex' }}
      >
        <Text fontSize="$3">{(standing.pointsFor ?? 0).toFixed(2)}</Text>
      </YStack>
      <YStack
        tag="td"
        role="cell"
        width={80}
        alignItems="center"
        display="none"
        $gtMd={{ display: 'flex' }}
      >
        <Text fontSize="$3">{(standing.pointsAgainst ?? 0).toFixed(2)}</Text>
      </YStack>
      <YStack
        tag="td"
        role="cell"
        width={70}
        alignItems="center"
        display="none"
        $gtMd={{ display: 'flex' }}
      >
        <Text fontSize="$3" color={diffColor}>
          {diff == null ? '—' : `${diff > 0 ? '+' : ''}${diff.toFixed(1)}`}
        </Text>
      </YStack>
    </XStack>
  );
}

/**
 * StandingsTable - Sortable league standings table.
 *
 * Full column set: Rank, Team, W, L, T, Win%, PF, PA, Diff (PF−PA). Supports
 * division grouping (rank resets per division), current-user row highlight,
 * row press navigation, and responsive column hiding (T/Win% hide below `$sm`,
 * PF/PA/Diff hide below `$md`).
 */
export function StandingsTable({
  standings,
  loading = false,
  error = null,
  currentUserTeamId = null,
  onTeamPress,
  title = 'League Standings',
  subtitle,
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

  const hasDivisions = useMemo(
    () => standings.some((s) => s.divisionId != null),
    [standings],
  );

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

  const isCurrentUser = (s: StandingRecord) =>
    currentUserTeamId != null &&
    s.teamId != null &&
    Number(s.teamId) === currentUserTeamId;

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

  // Header uses semantic table markup via Tamagui `tag` prop for cross-platform
  // accessibility (ARIA roles for native, HTML semantics for web).
  const HeaderRow = () => (
    <YStack tag="thead" role="rowgroup">
      <XStack
        tag="tr"
        role="row"
        width="100%"
        paddingVertical="$2"
        paddingHorizontal="$3"
        borderBottomWidth={1}
        borderBottomColor="$gray6"
        gap="$2"
      >
        <YStack
          tag="th"
          {...{ scope: 'col' }}
          role="columnheader"
          width={44}
          alignItems="center"
        >
          <Text fontSize="$3" fontWeight="bold" color="$gray11">
            #
          </Text>
        </YStack>
        <YStack
          tag="th"
          {...{ scope: 'col' }}
          role="columnheader"
          flex={1}
          minWidth={120}
        >
          <SortButton label="Team" sortKeyValue="team" />
        </YStack>
        <YStack
          tag="th"
          {...{ scope: 'col' }}
          role="columnheader"
          width={44}
          alignItems="center"
        >
          <SortButton label="W" sortKeyValue="wins" />
        </YStack>
        <YStack
          tag="th"
          {...{ scope: 'col' }}
          role="columnheader"
          width={44}
          alignItems="center"
        >
          <SortButton label="L" sortKeyValue="losses" />
        </YStack>
        <YStack
          tag="th"
          {...{ scope: 'col' }}
          role="columnheader"
          width={44}
          alignItems="center"
          display="none"
          $gtSm={{ display: 'flex' }}
        >
          <SortButton label="T" sortKeyValue="ties" />
        </YStack>
        <YStack
          tag="th"
          {...{ scope: 'col' }}
          role="columnheader"
          width={60}
          alignItems="center"
          display="none"
          $gtSm={{ display: 'flex' }}
        >
          <SortButton label="Win%" sortKeyValue="winPct" />
        </YStack>
        <YStack
          tag="th"
          {...{ scope: 'col' }}
          role="columnheader"
          width={80}
          alignItems="center"
          display="none"
          $gtMd={{ display: 'flex' }}
        >
          <SortButton label="PF" sortKeyValue="pointsFor" />
        </YStack>
        <YStack
          tag="th"
          {...{ scope: 'col' }}
          role="columnheader"
          width={80}
          alignItems="center"
          display="none"
          $gtMd={{ display: 'flex' }}
        >
          <SortButton label="PA" sortKeyValue="pointsAgainst" />
        </YStack>
        <YStack
          tag="th"
          {...{ scope: 'col' }}
          role="columnheader"
          width={70}
          alignItems="center"
          display="none"
          $gtMd={{ display: 'flex' }}
        >
          <SortButton label="Diff" sortKeyValue="diff" />
        </YStack>
      </XStack>
    </YStack>
  );

  return (
    <Card elevate bordered padding="$4" width="100%" maxWidth={900}>
      <H3 marginBottom={subtitle ? '$1' : '$3'}>{title}</H3>
      {subtitle ? (
        <Text fontSize="$2" color="$gray11" marginBottom="$3">
          {subtitle}
        </Text>
      ) : null}
      <Separator marginBottom="$3" />

      {hasDivisions && divisionGroups ? (
        <YStack gap="$4">
          {divisionGroups.map((group) => (
            <YStack key={group.divisionId}>
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
              <YStack
                tag="table"
                role="table"
                aria-label={`${title} — Division ${group.divisionId}`}
              >
                <HeaderRow />
                <YStack tag="tbody" role="rowgroup">
                  {group.teams.map((standing, index) => (
                    <StandingsRow
                      key={standing.teamId}
                      standing={standing}
                      index={index}
                      rank={index + 1}
                      isCurrentUser={isCurrentUser(standing)}
                      onTeamPress={onTeamPress}
                    />
                  ))}
                </YStack>
              </YStack>
            </YStack>
          ))}
        </YStack>
      ) : (
        <YStack tag="table" role="table" aria-label={title}>
          <HeaderRow />
          <YStack tag="tbody" role="rowgroup">
            {sortedStandings.map((standing, index) => (
              <StandingsRow
                key={standing.teamId}
                standing={standing}
                index={index}
                rank={index + 1}
                isCurrentUser={isCurrentUser(standing)}
                onTeamPress={onTeamPress}
              />
            ))}
          </YStack>
        </YStack>
      )}
    </Card>
  );
}
