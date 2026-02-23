import React, { useCallback, useState } from 'react';
import {
  Button,
  Input,
  Spinner,
  styled,
  Text,
  Tooltip,
  XStack,
  YStack,
} from 'tamagui';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Search,
  UserPlus,
  Users,
  X,
} from '@tamagui/lucide-icons';
import { WaiverClaimModal } from './WaiverClaimModal';
import { useGetPlayersWithStatsQuery } from '../../api/db/graphql.generated';
import { useLeagueTakenPlayers } from '../../hooks/useLeagueTakenPlayers';

/* ── Constants ─────────────────────────────────────────────────────────────── */

const PAGE_SIZE = 50;

const POSITIONS = [
  'ALL',
  'P',
  'C',
  '1B',
  '2B',
  '3B',
  'SS',
  'OF',
  'DH',
] as const;

/** Stat columns rendered in the data grid */
const STAT_COLUMNS: {
  key: string;
  label: string;
  sortKey?: SortKey;
  width: number;
  description: string;
  isBold?: boolean;
}[] = [
  {
    key: 'games',
    label: 'G',
    sortKey: 'careerGames',
    width: 48,
    description: 'Career Games',
  },
  {
    key: 'runs',
    label: 'R',
    sortKey: 'careerRuns',
    width: 48,
    description: 'Career Runs',
  },
  {
    key: 'homeRuns',
    label: 'HR',
    sortKey: 'careerHomeRuns',
    width: 48,
    description: 'Career Home Runs',
  },
  {
    key: 'rbi',
    label: 'RBI',
    sortKey: 'careerRBI',
    width: 48,
    description: 'Career RBI',
  },
  {
    key: 'stolenBases',
    label: 'SB',
    sortKey: 'careerStolenBases',
    width: 48,
    description: 'Career Stolen Bases',
  },
];

/** Scoring columns — populated by compute_career_scores DB function */
const SCORING_COLUMNS: {
  key: string;
  label: string;
  sortKey: SortKey;
  width: number;
  description: string;
  isBold?: boolean;
}[] = [
  {
    key: 'totalScore',
    label: 'PTS',
    sortKey: 'totalScore',
    width: 60,
    description: 'Total Fantasy Points',
    isBold: true,
  },
  {
    key: 'avgPointsPerGame',
    label: 'PROJ',
    sortKey: 'avgPointsPerGame',
    width: 60,
    description: 'Projected Points This Week',
    isBold: true,
  },
  {
    key: 'battingScore',
    label: 'BAT',
    sortKey: 'battingScore',
    width: 56,
    description: 'Batting Score',
  },
  {
    key: 'pitchingScore',
    label: 'PITCH',
    sortKey: 'pitchingScore',
    width: 56,
    description: 'Pitching Score',
  },
  {
    key: 'fieldingScore',
    label: 'FLD',
    sortKey: 'fieldingScore',
    width: 56,
    description: 'Fielding Score',
  },
];

/* ── Styled Components ─────────────────────────────────────────────────────── */

const ToolbarContainer = styled(YStack, {
  position: 'sticky',
  top: 0,
  zIndex: 100,
  backgroundColor: '$background',
  paddingVertical: '$3',
  paddingHorizontal: '$4',
  gap: '$3',
  borderBottomWidth: 1,
  borderBottomColor: '$borderColor',
});

const SearchBox = styled(XStack, {
  backgroundColor: '$color1',
  borderColor: '$borderColor',
  borderWidth: 1,
  borderRadius: '$3',
  paddingHorizontal: '$3',
  alignItems: 'center',
  flex: 1,
  minWidth: 180,
  focusWithinStyle: {
    borderColor: '$blue8',
  },
});

const PositionChip = styled(Button, {
  size: '$2',
  borderRadius: '$10',
  borderWidth: 1,
  paddingHorizontal: '$3',
  paddingVertical: '$1',
  variants: {
    selected: {
      true: {
        backgroundColor: '$blue4',
        borderColor: '$blue7',
      },
      false: {
        backgroundColor: 'transparent',
        borderColor: '$borderColor',
      },
    },
  } as const,
});

const HeaderRow = styled(XStack, {
  paddingHorizontal: '$4',
  paddingVertical: '$2',
  backgroundColor: '$color2',
  alignItems: 'center',
  borderBottomWidth: 1,
  borderBottomColor: '$borderColor',
  minWidth: 900,
});

const DataRow = styled(XStack, {
  paddingHorizontal: '$4',
  paddingVertical: '$3',
  alignItems: 'center',
  borderBottomWidth: 1,
  borderBottomColor: '$borderColor',
  cursor: 'default',
  hoverStyle: {
    backgroundColor: '$color2',
  },
  pressStyle: {
    backgroundColor: '$color3',
  },
});

const PositionBadge = styled(XStack, {
  backgroundColor: '$blue2',
  borderColor: '$blue6',
  borderWidth: 1,
  borderRadius: '$2',
  paddingHorizontal: '$2',
  paddingVertical: '$0.5',
  alignItems: 'center',
  justifyContent: 'center',
});

const PaginationBar = styled(XStack, {
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingHorizontal: '$4',
  paddingVertical: '$3',
  borderTopWidth: 1,
  borderTopColor: '$borderColor',
  backgroundColor: '$color1',
});

const EmptyState = styled(YStack, {
  padding: '$8',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '$3',
});

const StatCell = styled(Text, {
  textAlign: 'center',
  fontSize: '$2',
  fontFamily: '$mono',
  color: '$color11',
});

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface LeagueFreeAgentsProps {
  leagueId: number;
  /** Games per matchup from league settings. Defaults to 5. */
  gamesPerMatchup?: number;
}

type SortKey =
  | 'lastName'
  | 'careerGames'
  | 'careerHomeRuns'
  | 'careerRBI'
  | 'careerRuns'
  | 'careerStolenBases'
  | 'totalScore'
  | 'avgPointsPerGame'
  | 'battingScore'
  | 'pitchingScore'
  | 'fieldingScore';

/* ── Sub-components ────────────────────────────────────────────────────────── */

/** Sortable column header */
const SortableHeader: React.FC<{
  label: string;
  sortKey?: SortKey;
  currentSort: SortKey;
  sortDirection: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
  width?: number;
  flex?: number;
  align?: 'left' | 'center';
  description?: string;
}> = ({
  label,
  sortKey,
  currentSort,
  sortDirection,
  onSort,
  width,
  flex,
  align = 'center',
  description,
}) => {
  const isSorted = sortKey && currentSort === sortKey;

  return (
    <XStack
      width={width}
      flex={flex}
      onPress={sortKey ? () => onSort(sortKey) : undefined}
      cursor={sortKey ? 'pointer' : 'default'}
      justifyContent={align === 'center' ? 'center' : 'flex-start'}
      alignItems="center"
      gap="$1"
      hoverStyle={sortKey ? { opacity: 0.7 } : undefined}
      aria-label={description}
    >
      <Text
        fontSize={11}
        fontWeight="700"
        textTransform="uppercase"
        letterSpacing={0.5}
        color={isSorted ? '$blue10' : '$color9'}
        numberOfLines={1}
        whiteSpace="nowrap"
      >
        {label}
      </Text>
      {isSorted && (
        <Text fontSize={9} color="$blue10">
          {sortDirection === 'asc' ? '▲' : '▼'}
        </Text>
      )}
    </XStack>
  );
};

/** Format a batting rate (AVG, OPS) for display */
function formatRate(value: number): string {
  return value.toFixed(3).replace(/^0/, '');
}

/** Compute derived batting stats from raw career data */
function computeRateStats(career: {
  hits?: number | null;
  atBats?: number | null;
  plateAppearances?: number | null;
  baseOnBalls?: number | null;
  hitByPitch?: number | null;
  totalBases?: number | null;
}) {
  const h = career.hits ?? 0;
  const ab = career.atBats ?? 0;
  const bb = career.baseOnBalls ?? 0;
  const hbp = career.hitByPitch ?? 0;
  const pa = career.plateAppearances ?? ab + bb + hbp;
  const tb = career.totalBases ?? h;

  const avg = ab > 0 ? h / ab : 0;
  const obp = pa > 0 ? (h + bb + hbp) / pa : 0;
  const slg = ab > 0 ? tb / ab : 0;

  return { avg, ops: obp + slg, hasData: ab > 0 };
}

/* ── Main Component ────────────────────────────────────────────────────────── */

export const LeagueFreeAgents: React.FC<LeagueFreeAgentsProps> = ({
  leagueId,
  gamesPerMatchup = 5,
}) => {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [positionFilter, setPositionFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<SortKey>('avgPointsPerGame');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [claimPlayer, setClaimPlayer] = useState<{
    id: number;
    firstName?: string | null;
    lastName?: string | null;
    eligiblePositions?: string[] | null;
  } | null>(null);

  const { data, loading, error } = useGetPlayersWithStatsQuery({
    variables: {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      orderBy: sortBy,
      orderDirection: sortDirection,
      position: positionFilter === 'ALL' ? undefined : positionFilter,
      leagueId,
    },
    fetchPolicy: 'cache-and-network',
  });

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortBy === key) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortBy(key);
        setSortDirection(key === 'lastName' ? 'asc' : 'desc');
      }
      setPage(0);
    },
    [sortBy],
  );

  const handlePositionChange = useCallback((pos: string) => {
    setPositionFilter(pos);
    setPage(0);
  }, []);

  const { takenPlayerIds, loading: takenLoading } =
    useLeagueTakenPlayers(leagueId);

  const players = data?.players ?? [];

  // Client-side filtering: exclude taken players and apply local search
  const displayPlayers = players.filter((player) => {
    if (!player?.id || takenPlayerIds.has(player.id)) return false;
    if (search) {
      const fullName = `${player.firstName} ${player.lastName}`.toLowerCase();
      if (!fullName.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const isLoading = loading || takenLoading;
  const hasNextPage = players.length >= PAGE_SIZE;

  return (
    <YStack flex={1}>
      {/* ── Toolbar ──────────────────────────────────────────────── */}
      <ToolbarContainer>
        <XStack gap="$3" alignItems="center" flexWrap="wrap">
          {/* Search */}
          <SearchBox>
            <Search size={14} color="$color9" />
            <Input
              flex={1}
              unstyled
              placeholder="Search players…"
              placeholderTextColor="$color8"
              value={search}
              onChangeText={setSearch}
              paddingHorizontal="$2"
              paddingVertical="$2"
              fontSize={14}
              color="$color"
            />
            {search.length > 0 && (
              <XStack
                onPress={() => setSearch('')}
                cursor="pointer"
                padding="$1"
                borderRadius="$10"
                hoverStyle={{ backgroundColor: '$color3' }}
              >
                <X size={12} color="$color9" />
              </XStack>
            )}
          </SearchBox>

          {/* Position filter chips */}
          <XStack gap="$1.5" flexWrap="wrap" alignItems="center">
            {POSITIONS.map((pos) => (
              <PositionChip
                key={pos}
                selected={positionFilter === pos}
                onPress={() => handlePositionChange(pos)}
              >
                <Text
                  fontSize={12}
                  fontWeight={positionFilter === pos ? '700' : '500'}
                  color={positionFilter === pos ? '$blue11' : '$color10'}
                >
                  {pos}
                </Text>
              </PositionChip>
            ))}
          </XStack>
        </XStack>
      </ToolbarContainer>

      {/* ── Table Header ─────────────────────────────────────── */}
      <HeaderRow>
        <SortableHeader
          label="Player"
          sortKey="lastName"
          currentSort={sortBy}
          sortDirection={sortDirection}
          onSort={handleSort}
          flex={2}
          align="left"
          description="Sort by last name"
        />
        <Text
          width={64}
          fontSize={11}
          fontWeight="700"
          textTransform="uppercase"
          letterSpacing={0.5}
          color="$color9"
          textAlign="center"
        >
          Pos
        </Text>
        {SCORING_COLUMNS.map((col) => (
          <SortableHeader
            key={col.key}
            label={col.label}
            sortKey={col.sortKey}
            currentSort={sortBy}
            sortDirection={sortDirection}
            onSort={handleSort}
            width={col.width}
            description={col.description}
          />
        ))}
        {STAT_COLUMNS.map((col) => (
          <SortableHeader
            key={col.key}
            label={col.label}
            sortKey={col.sortKey}
            currentSort={sortBy}
            sortDirection={sortDirection}
            onSort={handleSort}
            width={col.width}
            description={col.description}
          />
        ))}
        <SortableHeader
          label="AVG"
          currentSort={sortBy}
          sortDirection={sortDirection}
          onSort={handleSort}
          width={56}
          description="Batting Average"
        />
        <SortableHeader
          label="OPS"
          currentSort={sortBy}
          sortDirection={sortDirection}
          onSort={handleSort}
          width={56}
          description="On-base Plus Slugging"
        />
        {/* Spacer for action button column */}
        <XStack width={44} />
      </HeaderRow>

      {/* ── Body ─────────────────────────────────────────────────── */}
      <YStack flex={1} minHeight={200}>
        {error ? (
          <EmptyState>
            <AlertCircle size={32} color="$red10" />
            <Text color="$red10" fontWeight="600" fontSize="$4">
              Unable to load players
            </Text>
            <Text color="$color9" fontSize="$3" textAlign="center">
              Check your connection and try refreshing.
            </Text>
          </EmptyState>
        ) : isLoading && displayPlayers.length === 0 ? (
          <EmptyState>
            <Spinner size="large" color="$blue10" />
            <Text color="$color9" fontSize="$3">
              Loading free agents…
            </Text>
          </EmptyState>
        ) : displayPlayers.length === 0 ? (
          <EmptyState>
            <Users size={32} color="$color8" />
            <Text color="$color10" fontWeight="600" fontSize="$4">
              No players found
            </Text>
            <Text color="$color9" fontSize="$3" textAlign="center">
              Try adjusting your search or position filter.
            </Text>
          </EmptyState>
        ) : (
          <>
            {/* Inline loading indicator for background refetches */}
            {isLoading && (
              <XStack
                paddingVertical="$1"
                paddingHorizontal="$4"
                backgroundColor="$blue2"
                alignItems="center"
                gap="$2"
              >
                <Spinner size="small" color="$blue10" />
                <Text fontSize={12} color="$blue10">
                  Updating…
                </Text>
              </XStack>
            )}

            {displayPlayers.map((player, index) => {
              const stats = player.careerBatting;
              const rates = stats ? computeRateStats(stats) : null;
              const statVal = (v: number | undefined | null) =>
                v != null ? String(v) : '–';

              return (
                <DataRow
                  key={player.id}
                  backgroundColor={index % 2 === 0 ? 'transparent' : '$color1'}
                >
                  {/* Player name & ID */}
                  <YStack flex={2} gap="$0.5">
                    <Text fontWeight="600" fontSize="$3" color="$color12">
                      {player.firstName} {player.lastName}
                    </Text>
                    <Text fontSize={11} color="$color8" fontFamily="$mono">
                      {player.brefId}
                    </Text>
                  </YStack>

                  {/* Position badges */}
                  <XStack
                    width={64}
                    justifyContent="center"
                    flexWrap="wrap"
                    gap="$1"
                  >
                    {player.eligiblePositions &&
                    player.eligiblePositions.length > 0 ? (
                      player.eligiblePositions.length > 2 ? (
                        <Tooltip placement="top">
                          <Tooltip.Trigger>
                            <XStack
                              flexWrap="wrap"
                              gap="$1"
                              justifyContent="center"
                              cursor="pointer"
                            >
                              {player.eligiblePositions
                                .slice(0, 2)
                                .map((pos) => (
                                  <PositionBadge key={pos}>
                                    <Text
                                      fontSize={10}
                                      fontWeight="700"
                                      color="$blue11"
                                    >
                                      {pos}
                                    </Text>
                                  </PositionBadge>
                                ))}
                              <Text fontSize={9} color="$color8">
                                +{player.eligiblePositions.length - 2}
                              </Text>
                            </XStack>
                          </Tooltip.Trigger>
                          <Tooltip.Content
                            enterStyle={{
                              x: 0,
                              y: -5,
                              opacity: 0,
                              scale: 0.9,
                            }}
                            exitStyle={{
                              x: 0,
                              y: -5,
                              opacity: 0,
                              scale: 0.9,
                            }}
                            scale={1}
                            x={0}
                            y={0}
                            opacity={1}
                            animation={[
                              'quick',
                              {
                                opacity: {
                                  overshootClamping: true,
                                },
                              },
                            ]}
                          >
                            <Tooltip.Arrow />
                            <Text
                              fontSize="$3"
                              fontWeight="600"
                              color="$blue11"
                            >
                              {player.eligiblePositions.join(', ')}
                            </Text>
                          </Tooltip.Content>
                        </Tooltip>
                      ) : (
                        player.eligiblePositions.map((pos) => (
                          <PositionBadge key={pos}>
                            <Text
                              fontSize={10}
                              fontWeight="700"
                              color="$blue11"
                            >
                              {pos}
                            </Text>
                          </PositionBadge>
                        ))
                      )
                    ) : (
                      <Text fontSize={11} color="$color8">
                        –
                      </Text>
                    )}
                  </XStack>

                  {/* Scoring cells */}
                  <StatCell width={60} fontWeight="700" color="$green11">
                    {player.scoring?.totalScore != null
                      ? Math.round(player.scoring.totalScore).toLocaleString()
                      : '–'}
                  </StatCell>
                  <StatCell width={60} fontWeight="700" color="$blue11">
                    {player.scoring?.avgPointsPerGame != null
                      ? (
                          player.scoring.avgPointsPerGame * gamesPerMatchup
                        ).toFixed(1)
                      : '–'}
                  </StatCell>
                  <StatCell width={56}>
                    {player.scoring?.battingScore != null
                      ? Math.round(player.scoring.battingScore).toLocaleString()
                      : '–'}
                  </StatCell>
                  <StatCell width={56}>
                    {player.scoring?.pitchingScore != null
                      ? Math.round(
                          player.scoring.pitchingScore,
                        ).toLocaleString()
                      : '–'}
                  </StatCell>
                  <StatCell width={56}>
                    {player.scoring?.fieldingScore != null
                      ? Math.round(
                          player.scoring.fieldingScore,
                        ).toLocaleString()
                      : '–'}
                  </StatCell>

                  {/* Career stat cells */}
                  <StatCell width={48}>{statVal(stats?.games)}</StatCell>
                  <StatCell width={48}>{statVal(stats?.runs)}</StatCell>
                  <StatCell width={48}>{statVal(stats?.homeRuns)}</StatCell>
                  <StatCell width={48}>{statVal(stats?.rbi)}</StatCell>
                  <StatCell width={48}>{statVal(stats?.stolenBases)}</StatCell>

                  {/* Rates */}
                  <StatCell width={56} fontWeight="700">
                    {rates?.hasData ? formatRate(rates.avg) : '–'}
                  </StatCell>
                  <StatCell width={56}>
                    {rates?.hasData ? formatRate(rates.ops) : '–'}
                  </StatCell>

                  {/* Action */}
                  <XStack width={44} justifyContent="center">
                    <Button
                      icon={UserPlus}
                      size="$2"
                      circular
                      backgroundColor="$blue3"
                      borderColor="$blue7"
                      borderWidth={1}
                      color="$blue11"
                      hoverStyle={{
                        backgroundColor: '$blue4',
                        borderColor: '$blue8',
                        scale: 1.05,
                      }}
                      pressStyle={{ scale: 0.95 }}
                      onPress={() =>
                        setClaimPlayer({
                          id: player.id ?? 0,
                          firstName: player.firstName,
                          lastName: player.lastName,
                          eligiblePositions: player.eligiblePositions,
                        })
                      }
                      aria-label={`Add ${player.firstName} ${player.lastName}`}
                    />
                  </XStack>
                </DataRow>
              );
            })}
          </>
        )}
      </YStack>

      {/* ── Pagination ───────────────────────────────────────────── */}
      <PaginationBar>
        <Text fontSize={12} color="$color9">
          {displayPlayers.length > 0
            ? `Showing ${page * PAGE_SIZE + 1}–${page * PAGE_SIZE + displayPlayers.length}`
            : 'No results'}
        </Text>

        <XStack gap="$3" alignItems="center">
          <Button
            disabled={page === 0}
            onPress={() => setPage((p) => Math.max(0, p - 1))}
            icon={ChevronLeft}
            size="$2"
            circular
            chromeless
            opacity={page === 0 ? 0.4 : 1}
            aria-label="Previous page"
          />
          <Text fontSize="$2" fontWeight="600" color="$color11">
            {page + 1}
          </Text>
          <Button
            disabled={!hasNextPage}
            onPress={() => setPage((p) => p + 1)}
            icon={ChevronRight}
            size="$2"
            circular
            chromeless
            opacity={!hasNextPage ? 0.4 : 1}
            aria-label="Next page"
          />
        </XStack>
      </PaginationBar>

      {/* ── Waiver Claim Modal ────────────────────────────────── */}
      {claimPlayer && (
        <WaiverClaimModal
          open
          onClose={() => setClaimPlayer(null)}
          player={claimPlayer}
          leagueId={leagueId}
        />
      )}
    </YStack>
  );
};
