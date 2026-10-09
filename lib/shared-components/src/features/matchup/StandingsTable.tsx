import React, { useMemo, useState } from 'react';
import { Card, H3, Separator, Text, useMedia, XStack, YStack } from 'tamagui';
import { Eye } from '@tamagui/lucide-icons/icons/Eye';
import {
  ClinchBadge,
  DEFAULT_SORT_DIRECTION,
  DEFAULT_SORT_KEY,
  diffOf,
  formatDiff,
  formatMedianRecord,
  formatWinPct,
  rankBadgeColor,
  type SortDirection,
  type SortKey,
  sortStandings,
  type StandingRecord,
  teamDisplayName,
} from './standingsTableModel';
import {
  type StandingsGroup,
  StandingsScrollSkeleton,
  StandingsScrollTable,
} from './StandingsScrollTable';
import { BRAND_GOLD, BRAND_GOLD_LIGHT, withAlpha } from '../../utils/colors';
import { AvatarImage } from '../../components/AvatarImage';

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
  /**
   * When provided, the team name cell renders as an `<a href>` so users can
   * right-click → "Open in new tab" and keyboard users get a semantic link.
   * Invoked with the numeric team id; return the destination URL string.
   */
  getTeamUrl?: (teamId: number) => string;
  /** Header title (defaults to "League Standings"). */
  title?: string;
  /** Optional subtitle rendered under the title. */
  subtitle?: string;
  /** When true, renders the Waiver Order column. */
  showWaiverOrder?: boolean;
  /** Map of teamId (string) → waiver order position. */
  waiverOrders?: Record<string, number>;
  /**
   * When true, renders the Median W-L column (premium "all-play" scoring
   * option — LS-6344). Sourced from `standing.medianWins`/`medianLosses`.
   */
  showMedianRecord?: boolean;
  /** Fires when the user changes the sort, so callers can caption it. */
  onSortChange?: (sortKey: SortKey, sortDirection: SortDirection) => void;
}

export {
  DEFAULT_SORT_DIRECTION,
  DEFAULT_SORT_KEY,
  describeStandingsSort,
} from './standingsTableModel';

function streakColor(streak: string | null | undefined): string | undefined {
  if (!streak) return undefined;
  if (streak.startsWith('W')) return '$green10';
  if (streak.startsWith('L')) return '$red10';
  return undefined;
}

interface StandingsRowProps {
  standing: StandingRecord;
  index: number;
  rank: number;
  isCurrentUser: boolean;
  onTeamPress?: (teamId: number) => void;
  getTeamUrl?: (teamId: number) => string;
  waiverOrder?: number | null;
  showWaiverOrder?: boolean;
  showMedianRecord?: boolean;
}

function StandingsRow({
  standing,
  index,
  rank,
  isCurrentUser,
  onTeamPress,
  getTeamUrl,
  waiverOrder,
  showWaiverOrder,
  showMedianRecord,
}: StandingsRowProps) {
  const [hovered, setHovered] = useState(false);
  const teamId = standing.teamId != null ? Number(standing.teamId) : null;
  const pressable = onTeamPress != null && teamId != null;
  const teamUrl =
    teamId != null && getTeamUrl != null ? getTeamUrl(teamId) : undefined;
  const diff = diffOf(standing);
  const diffColor =
    diff == null
      ? undefined
      : diff > 0
        ? '$green10'
        : diff < 0
          ? '$red10'
          : undefined;
  const badgeColor = rankBadgeColor(rank);

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
      onHoverIn={pressable ? () => setHovered(true) : undefined}
      onHoverOut={pressable ? () => setHovered(false) : undefined}
      onPress={pressable ? () => onTeamPress(teamId) : undefined}
    >
      <YStack
        tag="td"
        role="cell"
        width={44}
        alignItems="center"
        justifyContent="center"
      >
        <YStack
          width={28}
          height={28}
          borderRadius={14}
          backgroundColor={withAlpha(badgeColor, 0.18)}
          alignItems="center"
          justifyContent="center"
        >
          <Text fontSize="$2" fontWeight="bold" color={badgeColor}>
            {rank}
          </Text>
        </YStack>
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
            tag={teamUrl ? 'a' : undefined}
            {...(teamUrl
              ? ({
                  href: teamUrl,
                  onClick: (e: React.MouseEvent) => {
                    if (e.button === 0) {
                      e.preventDefault();
                      e.stopPropagation();
                      if (onTeamPress != null && teamId != null) {
                        onTeamPress(teamId);
                      }
                    }
                  },
                } as Record<string, unknown>)
              : {})}
            flex={1}
            minWidth={0}
            numberOfLines={2}
            fontSize="$3"
            fontWeight="600"
            color={isCurrentUser ? BRAND_GOLD_LIGHT : undefined}
            textDecorationLine="none"
          >
            {teamDisplayName(standing)}
          </Text>
          {standing.clinchStatus ? (
            <ClinchBadge status={standing.clinchStatus} />
          ) : null}
          {isCurrentUser ? (
            <Text
              flexShrink={0}
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
          {hovered && pressable ? <Eye size={14} color="$gray10" /> : null}
        </XStack>
      </YStack>
      <YStack
        tag="td"
        role="cell"
        width={44}
        alignItems="center"
        justifyContent="center"
      >
        <Text fontSize="$3" color="$green10" fontWeight="bold">
          {standing.wins ?? 0}
        </Text>
      </YStack>
      <YStack
        tag="td"
        role="cell"
        width={44}
        alignItems="center"
        justifyContent="center"
      >
        <Text fontSize="$3" color="$red10" fontWeight="bold">
          {standing.losses ?? 0}
        </Text>
      </YStack>
      <YStack
        tag="td"
        role="cell"
        width={44}
        alignItems="center"
        justifyContent="center"
      >
        <Text fontSize="$3">{standing.ties ?? 0}</Text>
      </YStack>
      <YStack
        tag="td"
        role="cell"
        width={60}
        alignItems="center"
        justifyContent="center"
      >
        <Text fontSize="$3" fontWeight="600">
          {formatWinPct(standing)}
        </Text>
      </YStack>
      <YStack
        tag="td"
        role="cell"
        width={80}
        alignItems="center"
        justifyContent="center"
      >
        <Text fontSize="$3">{(standing.pointsFor ?? 0).toFixed(2)}</Text>
      </YStack>
      <YStack
        tag="td"
        role="cell"
        width={80}
        alignItems="center"
        justifyContent="center"
      >
        <Text fontSize="$3">{(standing.pointsAgainst ?? 0).toFixed(2)}</Text>
      </YStack>
      <YStack
        tag="td"
        role="cell"
        width={70}
        alignItems="center"
        justifyContent="center"
      >
        <Text fontSize="$3" color={diffColor}>
          {formatDiff(diff)}
        </Text>
      </YStack>
      <YStack
        tag="td"
        role="cell"
        width={56}
        alignItems="center"
        justifyContent="center"
      >
        <Text
          fontSize="$3"
          fontWeight="600"
          color={streakColor(standing.streak)}
        >
          {standing.streak ?? '—'}
        </Text>
      </YStack>
      {showWaiverOrder ? (
        <YStack
          tag="td"
          role="cell"
          width={60}
          alignItems="center"
          justifyContent="center"
        >
          <Text fontSize="$3" color="$gray11">
            {waiverOrder ?? '—'}
          </Text>
        </YStack>
      ) : null}
      {showMedianRecord ? (
        <YStack
          tag="td"
          role="cell"
          width={70}
          alignItems="center"
          justifyContent="center"
        >
          <Text fontSize="$3" color="$gray11">
            {formatMedianRecord(standing)}
          </Text>
        </YStack>
      ) : null}
    </XStack>
  );
}

/**
 * StandingsTable - Sortable league standings table.
 *
 * Full column set: Rank, Team, W, L, T, Win%, PF, PA, Diff (PF−PA), Strk, and
 * optional Waiver / Median columns. All columns except Strk are sortable,
 * including Rank (sorts by win%, the ranking criterion) and Waiver. Supports
 * division grouping (rank resets per division), current-user row highlight,
 * and row press navigation.
 *
 * Every column is reachable at every width (LS-10717). From `$gtMd` (≥980)
 * this renders the single full-width table; below that it renders
 * {@link StandingsScrollTable}: # + Team pinned on the left and the stat
 * columns in a horizontally scrolling, keyboard-focusable pane with a scroll
 * cue.
 */
export function StandingsTable({
  standings,
  loading = false,
  error = null,
  currentUserTeamId = null,
  onTeamPress,
  getTeamUrl,
  title = 'League Standings',
  subtitle,
  showWaiverOrder = false,
  waiverOrders,
  showMedianRecord = false,
  onSortChange,
}: StandingsTableProps) {
  const media = useMedia();
  const wide = media.gtMd === true;
  const [sortKey, setSortKey] = useState<SortKey>(DEFAULT_SORT_KEY);
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    DEFAULT_SORT_DIRECTION,
  );

  const handleSort = (key: SortKey) => {
    const nextDirection: SortDirection =
      sortKey === key
        ? sortDirection === 'asc'
          ? 'desc'
          : 'asc'
        : key === 'team' || key === 'waiverOrder'
          ? 'asc'
          : 'desc';
    setSortKey(key);
    setSortDirection(nextDirection);
    onSortChange?.(key, nextDirection);
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

    return uniqueIds.map((divId, idx) => {
      const divTeams = standings.filter((s) => (s.divisionId ?? 0) === divId);
      const name = divTeams[0]?.divisionName ?? `Division ${idx + 1}`;
      return {
        divisionId: divId,
        divisionName: name,
        teams: sortStandings(divTeams, sortKey, sortDirection, waiverOrders),
      };
    });
  }, [hasDivisions, standings, sortKey, sortDirection, waiverOrders]);

  const sortedStandings = useMemo(
    () =>
      hasDivisions
        ? []
        : sortStandings(standings, sortKey, sortDirection, waiverOrders),
    [hasDivisions, standings, sortKey, sortDirection, waiverOrders],
  );

  if (loading) {
    return (
      <Card padding="$4" $xs={{ padding: '$3' }}>
        {wide ? (
          <Text color="$gray11">Loading standings...</Text>
        ) : (
          <StandingsScrollSkeleton
            showWaiverOrder={showWaiverOrder}
            showMedianRecord={showMedianRecord}
          />
        )}
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
        <Text
          color={wide ? '$gray11' : '$textMuted'}
          textAlign={wide ? undefined : 'center'}
        >
          No standings available
        </Text>
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
          <SortButton label="#" sortKeyValue="rank" />
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
        >
          <SortButton label="T" sortKeyValue="ties" />
        </YStack>
        <YStack
          tag="th"
          {...{ scope: 'col' }}
          role="columnheader"
          width={60}
          alignItems="center"
        >
          <SortButton label="Win%" sortKeyValue="winPct" />
        </YStack>
        <YStack
          tag="th"
          {...{ scope: 'col' }}
          role="columnheader"
          width={80}
          alignItems="center"
        >
          <SortButton label="PF" sortKeyValue="pointsFor" />
        </YStack>
        <YStack
          tag="th"
          {...{ scope: 'col' }}
          role="columnheader"
          width={80}
          alignItems="center"
        >
          <SortButton label="PA" sortKeyValue="pointsAgainst" />
        </YStack>
        <YStack
          tag="th"
          {...{ scope: 'col' }}
          role="columnheader"
          width={70}
          alignItems="center"
        >
          <SortButton label="Diff" sortKeyValue="diff" />
        </YStack>
        <YStack
          tag="th"
          {...{ scope: 'col' }}
          role="columnheader"
          width={56}
          alignItems="center"
        >
          <Text fontSize="$3" fontWeight="bold" color="$gray11">
            Strk
          </Text>
        </YStack>
        {showWaiverOrder ? (
          <YStack
            tag="th"
            {...{ scope: 'col' }}
            role="columnheader"
            width={60}
            alignItems="center"
          >
            <SortButton label="Waiver" sortKeyValue="waiverOrder" />
          </YStack>
        ) : null}
        {showMedianRecord ? (
          <YStack
            tag="th"
            {...{ scope: 'col' }}
            role="columnheader"
            width={70}
            alignItems="center"
          >
            <SortButton label="Median" sortKeyValue="medianRecord" />
          </YStack>
        ) : null}
      </XStack>
    </YStack>
  );

  if (!wide) {
    const groups: StandingsGroup[] =
      hasDivisions && divisionGroups
        ? divisionGroups.map((g) => ({
            key: String(g.divisionId),
            label: g.divisionName,
            teams: g.teams,
          }))
        : [{ key: 'all', label: null, teams: sortedStandings }];
    return (
      <Card
        elevate
        bordered
        padding="$4"
        $xs={{ padding: '$3' }}
        width="100%"
        maxWidth={900}
      >
        <H3 marginBottom="$1">{title}</H3>
        <StandingsScrollTable
          groups={groups}
          title={title}
          subtitle={subtitle}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={handleSort}
          isCurrentUser={isCurrentUser}
          onTeamPress={onTeamPress}
          getTeamUrl={getTeamUrl}
          showWaiverOrder={showWaiverOrder}
          waiverOrders={waiverOrders}
          showMedianRecord={showMedianRecord}
        />
        <Text fontSize="$1" color="$gray9" marginTop="$3">
          Ties in the standings are broken by total points scored (PF).
        </Text>
      </Card>
    );
  }

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
                  {group.divisionName}
                </Text>
              </XStack>
              <YStack
                tag="table"
                role="table"
                aria-label={`${title} — ${group.divisionName}`}
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
                      getTeamUrl={getTeamUrl}
                      showWaiverOrder={showWaiverOrder}
                      waiverOrder={
                        standing.teamId != null
                          ? waiverOrders?.[standing.teamId]
                          : undefined
                      }
                      showMedianRecord={showMedianRecord}
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
                showWaiverOrder={showWaiverOrder}
                waiverOrder={
                  standing.teamId != null
                    ? waiverOrders?.[standing.teamId]
                    : undefined
                }
                showMedianRecord={showMedianRecord}
              />
            ))}
          </YStack>
        </YStack>
      )}
      <Text fontSize="$1" color="$gray9" marginTop="$3">
        Ties in the standings are broken by total points scored (PF).
      </Text>
    </Card>
  );
}
