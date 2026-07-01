import React, { useEffect, useMemo, useState } from 'react';
import { Input, ScrollView, Text, XStack, YStack } from 'tamagui';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Info,
  Search,
} from '@tamagui/lucide-icons';
import { useApolloClient } from '@apollo/client/react';
import { LOGGER } from '@legacy-sports/logging';
import {
  type GetPlayersWithStatsQuery,
  GetTeamMembers,
  type GetTeamMembersQuery,
  type GetTeamMembersQueryVariables,
  useGetLeagueTeamsQuery,
  useGetPlayersWithStatsQuery,
} from '@legacy-sports/graphql';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED_LIGHT,
  GREEN_LIGHT,
  SLATE_400,
  withAlpha,
} from '../../utils/colors';
import { TABULAR_NUMS } from '../../utils/typography';

/**
 * Cross-platform Free Agents tab for the league-detail screen (LS-7818).
 *
 * Web is canonical (epic LS-7708, principle LS-7790): this component is a
 * tamagui port of the web v2 `FreeAgentsTab`. It owns the paginated player
 * pool, hitter/pitcher grouping, position + name filters, the full stat
 * column set, and the spectator/member banners. The actual waiver-claim UI is
 * abstracted behind the `renderClaimAction` callback so each platform supplies
 * its own flow (web: a button that opens `WaiverClaimModal`; native: an inline
 * FAAB claim cluster). Both consumers render the same list, filters, columns,
 * and banners — parity by construction.
 */

type PlayerWithStats = NonNullable<GetPlayersWithStatsQuery['players']>[number];

/** The minimal player shape the claim action needs to start a waiver claim. */
export interface FreeAgentClaimPlayer {
  id: number;
  firstName?: string | null;
  lastName?: string | null;
  eligiblePositions?: string[] | null;
}

/**
 * The league fields this tab reads. A structural interface (not the generated
 * `LeagueFragment`) so web and native can each pass their own generated league
 * type without nominal-type friction.
 */
export interface FreeAgentsTabLeague {
  id?: number | null;
  sport?: string | null;
  waiverEnabled?: boolean | null;
  waiverType?: string | null;
  faabBudgetDefault?: number | null;
  gamesPerMatchup?: number | null;
}

export interface LeagueDetailFreeAgentsTabProps {
  league: FreeAgentsTabLeague;
  isMember: boolean;
  myTeamId: number | null;
  /**
   * Render the per-row claim action. Called only for a viewer who can claim
   * (a member who is on a team). When omitted or when the viewer cannot claim,
   * the tab renders the default disabled Spectator / Join Team button.
   */
  renderClaimAction?: (player: FreeAgentClaimPlayer) => React.ReactNode;
}

type Group = 'hitters' | 'pitchers';

const PAGE_SIZE = 50;

const HITTER_POSITIONS = ['ALL', 'C', '1B', '2B', '3B', 'SS', 'OF', 'DH'];
const PITCHER_POSITIONS = ['ALL', 'SP', 'RP'];

interface StatCol {
  id: string;
  label: string;
  bold?: boolean;
}

const HITTER_COLS: StatCol[] = [
  { id: 'PTS', label: 'PTS', bold: true },
  { id: 'PROJ', label: 'PROJ', bold: true },
  { id: 'AVG', label: 'AVG' },
  { id: 'HR', label: 'HR' },
  { id: 'RBI', label: 'RBI' },
  { id: 'SB', label: 'SB' },
  { id: 'oWAR', label: 'oWAR' },
];

const PITCHER_COLS: StatCol[] = [
  { id: 'PTS', label: 'PTS', bold: true },
  { id: 'PROJ', label: 'PROJ', bold: true },
  { id: 'ERA', label: 'ERA', bold: true },
  { id: 'W', label: 'W' },
  { id: 'K', label: 'K' },
  { id: 'SV', label: 'SV' },
  { id: 'WHIP', label: 'WHIP' },
];

const POS_COLOR: Record<string, string> = {
  C: BRAND_GOLD_LIGHT,
  SP: BRAND_SEAM_RED_LIGHT,
  RP: BRAND_SEAM_RED_LIGHT,
  P: BRAND_SEAM_RED_LIGHT,
  '1B': BRAND_NAVY_LIGHT,
  '2B': BRAND_NAVY_LIGHT,
  '3B': BRAND_NAVY_LIGHT,
  SS: BRAND_NAVY_LIGHT,
  OF: GREEN_LIGHT,
  DH: SLATE_400,
};

const posColor = (pos?: string | null): string =>
  pos ? (POS_COLOR[pos.toUpperCase()] ?? SLATE_400) : SLATE_400;

const fmtAvg = (n: number | null | undefined): string =>
  n == null ? '—' : n.toFixed(3).replace(/^0\./, '.');

const fmtInt = (n: number | null | undefined): string =>
  n == null ? '—' : Math.round(n).toLocaleString();

const fmtF1 = (n: number | null | undefined): string =>
  n == null ? '—' : n.toFixed(1);

const fmtF2 = (n: number | null | undefined): string =>
  n == null ? '—' : n.toFixed(2);

const playerName = (p: PlayerWithStats): string =>
  [p?.firstName, p?.lastName]
    .filter((part): part is string => Boolean(part))
    .join(' ') || 'Unknown Player';

/** Aria/accessibility label for the per-row claim action. */
export const buildFreeAgentAriaLabel = (
  first?: string | null,
  last?: string | null,
): string => `Add ${[first, last].filter(Boolean).join(' ')}`.trim();

/**
 * Builds the set of player ids already on a roster in the league so they are
 * filtered out of the free-agent pool. Re-pulls on `refreshKey` changes (page /
 * filter / group) so pagination never surfaces a player rostered since mount
 * (LS-4032 / LS-4044). Ported from the web `useLeagueTakenPlayers` hook.
 */
function useLeagueTakenPlayers(
  leagueId: number,
  refreshKey: unknown,
): { takenPlayerIds: Set<number>; loading: boolean } {
  const client = useApolloClient();
  const { data: teamsData, loading: teamsLoading } = useGetLeagueTeamsQuery({
    variables: { leagueId },
    skip: !leagueId,
  });
  const [takenPlayerIds, setTakenPlayerIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [resolvedKey, setResolvedKey] = useState<unknown>(refreshKey);

  useEffect(() => {
    if (teamsLoading) return;
    if (!teamsData?.leagueTeams) {
      setLoading(false);
      setResolvedKey(refreshKey);
      return;
    }

    let active = true;
    const fetchMembers = async () => {
      setLoading(true);
      try {
        const teamIds = (teamsData.leagueTeams ?? [])
          .filter((t): t is NonNullable<typeof t> => t != null)
          .map((t) => t.id)
          .filter((id): id is number => id != null);

        const results = await Promise.all(
          teamIds.map((id) =>
            client.query<GetTeamMembersQuery, GetTeamMembersQueryVariables>({
              query: GetTeamMembers,
              variables: { teamId: id },
              fetchPolicy: 'network-only',
            }),
          ),
        );

        const ids = new Set<number>();
        results.forEach((res) => {
          res.data?.teamMembers?.forEach((m) => {
            if (m?.player?.id != null) ids.add(m.player.id);
          });
        });

        if (!active) return;
        setTakenPlayerIds(ids);
        setResolvedKey(refreshKey);
      } catch (err) {
        LOGGER.error(
          'Failed to fetch league rosters',
          err instanceof Error ? err : new Error(String(err)),
        );
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchMembers();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshKey drives the re-fetch; client/leagueId are stable
  }, [teamsData, teamsLoading, refreshKey]);

  // Report loading synchronously on the render where refreshKey changes, before
  // the effect fires, so the list never flashes already-claimed players.
  const isStale = resolvedKey !== refreshKey;
  return { takenPlayerIds, loading: loading || isStale };
}

/**
 * Web keyboard activation for custom `accessibilityRole="button"` elements:
 * Space / Enter fire the press handler so keyboard-only users can activate the
 * filter pills, group toggles, and pager. `onKeyDown` is web-only — it is a
 * no-op on native, where these elements are activated via touch.
 */
const keyActivate =
  (onActivate: () => void) =>
  (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onActivate();
    }
  };

const COL_WIDTH = 54;
const PLAYER_COL_WIDTH = 168;
const POS_COL_WIDTH = 46;
const ACTION_COL_WIDTH = 104;

const PlaceholderCard: React.FC<{
  title: string;
  body: string;
  role?: string;
}> = ({ title, body, role }) => (
  <YStack
    padding="$5"
    alignItems="center"
    gap="$2"
    {...(role ? { role: role as never } : {})}
  >
    <Text
      fontFamily="$heading"
      fontWeight="700"
      fontSize={14}
      letterSpacing={0.6}
      color="$color"
      textAlign="center"
    >
      {title}
    </Text>
    <Text color="$textMuted" fontSize={13} textAlign="center">
      {body}
    </Text>
  </YStack>
);

const Banner: React.FC<{
  tone: 'spectator' | 'info';
  icon: React.ReactNode;
  title: string;
  sub?: string;
}> = ({ tone, icon, title, sub }) => {
  const accent = tone === 'spectator' ? BRAND_GOLD_LIGHT : BRAND_NAVY_LIGHT;
  return (
    <XStack
      alignItems="center"
      gap="$3"
      padding="$3"
      borderRadius="$4"
      borderWidth={1}
      borderColor={withAlpha(accent, 0.35)}
      backgroundColor={withAlpha(accent, 0.12)}
    >
      <YStack>{icon}</YStack>
      <YStack flex={1} gap="$0.5">
        <Text fontWeight="700" fontSize={13} color="$color">
          {title}
        </Text>
        {sub ? (
          <Text fontSize={12} color="$textMuted">
            {sub}
          </Text>
        ) : null}
      </YStack>
    </XStack>
  );
};

const FilterPill: React.FC<{
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}> = ({ label, active, onPress, testID }) => (
  <Text
    testID={testID}
    onPress={onPress}
    tabIndex={0}
    onKeyDown={keyActivate(onPress)}
    paddingHorizontal="$2.5"
    paddingVertical="$1"
    borderRadius="$10"
    fontSize={12}
    fontWeight={active ? '700' : '500'}
    backgroundColor={active ? '$brandNavy' : '$surfaceCard'}
    color={active ? 'white' : '$textMuted'}
    borderWidth={1}
    borderColor={active ? '$brandNavy' : '$surfacePanelBorder'}
    pressStyle={{ opacity: 0.7 }}
    accessibilityRole="button"
    accessibilityLabel={label === 'ALL' ? 'All positions' : label}
    accessibilityState={{ selected: active }}
  >
    {label}
  </Text>
);

const GroupToggle: React.FC<{
  label: string;
  active: boolean;
  onPress: () => void;
}> = ({ label, active, onPress }) => (
  <Text
    onPress={onPress}
    tabIndex={0}
    onKeyDown={keyActivate(onPress)}
    paddingHorizontal="$3"
    paddingVertical="$1.5"
    fontSize={12}
    fontWeight={active ? '700' : '500'}
    fontFamily="$heading"
    letterSpacing={0.4}
    backgroundColor={active ? '$brandNavy' : 'transparent'}
    color={active ? 'white' : '$textMuted'}
    borderRadius="$3"
    pressStyle={{ opacity: 0.7 }}
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ selected: active }}
  >
    {label}
  </Text>
);

export const LeagueDetailFreeAgentsTab: React.FC<
  LeagueDetailFreeAgentsTabProps
> = ({ league, isMember, myTeamId, renderClaimAction }) => {
  const isFootball = league.sport === 'football';
  const [group, setGroup] = useState<Group>('hitters');
  const [pos, setPos] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  const handleGroup = (next: Group) => {
    setGroup(next);
    setPos('ALL');
    setPage(0);
  };

  const queryPosition =
    group === 'pitchers'
      ? pos === 'ALL'
        ? 'P'
        : pos
      : pos === 'ALL'
        ? 'HITTER'
        : pos;

  const orderBy =
    group === 'pitchers'
      ? 'pitchingAvgPointsPerGame'
      : 'hitterAvgPointsPerGame';

  const leagueId = league.id ?? 0;
  const gamesPerMatchup = league.gamesPerMatchup ?? 5;

  const { data, loading, error } = useGetPlayersWithStatsQuery({
    variables: {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      orderBy,
      orderDirection: 'desc',
      position: queryPosition,
      leagueId,
      search: debouncedSearch || undefined,
    },
    skip: !league.id || isFootball,
    fetchPolicy: 'cache-and-network',
  });

  const { takenPlayerIds, loading: takenLoading } = useLeagueTakenPlayers(
    leagueId,
    `${page}|${group}|${pos}|${debouncedSearch}`,
  );

  const players = useMemo(
    () =>
      (data?.players ?? []).filter(
        (p): p is PlayerWithStats => p?.id != null && !takenPlayerIds.has(p.id),
      ),
    [data?.players, takenPlayerIds],
  );

  const cols = group === 'pitchers' ? PITCHER_COLS : HITTER_COLS;
  const positions = group === 'pitchers' ? PITCHER_POSITIONS : HITTER_POSITIONS;
  const isLoading = loading || takenLoading;
  const hasNextPage = (data?.players ?? []).length >= PAGE_SIZE;

  if (isFootball) {
    return (
      <PlaceholderCard
        title="Football Player Pool"
        body="Football free-agent search and waiver claims for NFL players will be available here once the football player pool ships."
      />
    );
  }

  if (error) {
    return (
      <PlaceholderCard
        role="alert"
        title="Unable to load players"
        body="Refresh to try again."
      />
    );
  }

  const renderCell = (p: PlayerWithStats, col: StatCol): string => {
    const b = p.careerBatting;
    const pit = p.careerPitching;
    const s = p.scoring;
    switch (col.id) {
      case 'PTS':
        return fmtInt(group === 'pitchers' ? s?.pitchingScore : s?.hitterScore);
      case 'PROJ': {
        const perGame =
          group === 'pitchers'
            ? s?.pitchingAvgPointsPerGame
            : s?.hitterAvgPointsPerGame;
        return fmtF1(perGame != null ? perGame * gamesPerMatchup : null);
      }
      case 'AVG': {
        const h = b?.hits ?? 0;
        const ab = b?.atBats ?? 0;
        return ab > 0 ? fmtAvg(h / ab) : '—';
      }
      case 'HR':
        return fmtInt(b?.homeRuns);
      case 'RBI':
        return fmtInt(b?.rbi);
      case 'SB':
        return fmtInt(b?.stolenBases);
      case 'oWAR':
        return fmtF1(b?.offensiveWAR);
      case 'ERA':
        return pit?.era != null ? fmtF2(Number(pit.era)) : '—';
      case 'W':
        return fmtInt(pit?.wins);
      case 'K':
        return fmtInt(pit?.strikeouts);
      case 'SV':
        return fmtInt(pit?.saves);
      case 'WHIP': {
        const outs = pit?.outsRecorded ?? 0;
        if (outs === 0) return '—';
        const innings = outs / 3;
        const bb = pit?.baseOnBalls ?? 0;
        const h = pit?.hits ?? 0;
        return ((bb + h) / innings).toFixed(2);
      }
      default:
        return '—';
    }
  };

  const canClaim = isMember && myTeamId != null;
  const subTitle = league.waiverEnabled
    ? `${league.waiverType ?? 'Waivers'} active${
        league.faabBudgetDefault ? ` · FAAB ${league.faabBudgetDefault}` : ''
      }`
    : 'Available players in the league pool';
  const tableMinWidth =
    PLAYER_COL_WIDTH +
    POS_COL_WIDTH +
    cols.length * COL_WIDTH +
    ACTION_COL_WIDTH;

  return (
    <ScrollView flex={1}>
      <YStack padding="$3" gap="$3">
        {!isMember ? (
          <Banner
            tone="spectator"
            icon={<Eye size={20} color={BRAND_GOLD_LIGHT} />}
            title="Spectator Mode"
            sub="Browse the free-agent pool. Join the league to make claims."
          />
        ) : null}
        {league.waiverEnabled && isMember && myTeamId == null ? (
          <Banner
            tone="info"
            icon={<Info size={20} color={BRAND_NAVY_LIGHT} />}
            title="Join a team to make waiver claims"
          />
        ) : null}

        <YStack
          borderRadius={16}
          borderWidth={1}
          borderColor="$surfacePanelBorder"
          backgroundColor="$surfacePanel"
          padding="$3"
          gap="$3"
        >
          {/* Header: title + group toggle */}
          <XStack
            alignItems="center"
            justifyContent="space-between"
            flexWrap="wrap"
            gap="$2"
          >
            <YStack flex={1} minWidth={140} gap="$1">
              <Text
                fontFamily="$heading"
                fontWeight="700"
                fontSize={16}
                letterSpacing={0.4}
                color="$color"
              >
                Free Agents
              </Text>
              <Text fontSize={12} color="$textMuted">
                {subTitle}
              </Text>
              {league.waiverType?.toLowerCase() === 'faab' ? (
                <XStack alignSelf="flex-start">
                  <Text
                    fontSize={10}
                    fontWeight="700"
                    fontFamily="$heading"
                    letterSpacing={0.6}
                    textTransform="uppercase"
                    color={BRAND_GOLD_LIGHT}
                    paddingHorizontal="$2"
                    paddingVertical={3}
                    borderRadius="$10"
                    borderWidth={1}
                    borderColor={withAlpha(BRAND_GOLD_LIGHT, 0.4)}
                    backgroundColor={withAlpha(BRAND_GOLD_LIGHT, 0.12)}
                    accessibilityRole="text"
                    accessibilityLabel="Premium league — FAAB enabled by commissioner's Premium subscription"
                  >
                    Premium league
                  </Text>
                </XStack>
              ) : null}
            </YStack>
            <XStack
              backgroundColor="$surfaceCard"
              borderRadius="$3"
              padding={2}
              gap={2}
            >
              <GroupToggle
                label="Hitters"
                active={group === 'hitters'}
                onPress={() => handleGroup('hitters')}
              />
              <GroupToggle
                label="Pitchers"
                active={group === 'pitchers'}
                onPress={() => handleGroup('pitchers')}
              />
            </XStack>
          </XStack>

          {/* Search */}
          <XStack
            alignItems="center"
            gap="$2"
            paddingHorizontal="$3"
            borderRadius="$3"
            borderWidth={1}
            borderColor="$surfacePanelBorder"
            backgroundColor="$surfaceCard"
          >
            <Search size={16} color={SLATE_400} />
            <Input
              flex={1}
              unstyled
              borderWidth={0}
              backgroundColor="transparent"
              paddingVertical="$2"
              fontSize={13}
              color="$color"
              placeholder="Search players…"
              placeholderTextColor={SLATE_400}
              value={search}
              onChangeText={setSearch}
              aria-label="Search free agents by name"
            />
          </XStack>

          {/* Position filters */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
          >
            <XStack gap="$1.5">
              {positions.map((p) => (
                <FilterPill
                  key={p}
                  label={p}
                  active={pos === p}
                  testID={`position-filter-${p}`}
                  onPress={() => {
                    setPos(p);
                    setPage(0);
                  }}
                />
              ))}
            </XStack>
          </ScrollView>

          {/* Table */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <YStack minWidth={tableMinWidth} width="100%">
              {/* Header row */}
              <XStack
                paddingVertical="$2"
                borderBottomWidth={1}
                borderBottomColor="$outlineStrong"
                alignItems="center"
              >
                <HeaderCell width={PLAYER_COL_WIDTH}>Player</HeaderCell>
                <HeaderCell width={POS_COL_WIDTH}>Pos</HeaderCell>
                {cols.map((c) => (
                  <HeaderCell
                    key={c.id}
                    width={COL_WIDTH}
                    align="right"
                    testID={`fa-col-${c.id}`}
                  >
                    {c.label}
                  </HeaderCell>
                ))}
                <HeaderCell width={ACTION_COL_WIDTH} align="right">
                  Action
                </HeaderCell>
              </XStack>

              {/* Body rows */}
              {players.map((p) => {
                const playerId = p?.id;
                if (playerId == null) return null;
                const primaryPos = p.eligiblePositions?.[0] ?? null;
                return (
                  <XStack
                    key={playerId}
                    paddingVertical="$2"
                    alignItems="center"
                    borderBottomWidth={1}
                    borderBottomColor="$outlineSubtle"
                  >
                    <YStack width={PLAYER_COL_WIDTH} paddingRight="$2">
                      <Text
                        fontWeight="600"
                        fontSize={13}
                        color="$color"
                        numberOfLines={1}
                      >
                        {playerName(p)}
                      </Text>
                      {p.primaryEra != null ? (
                        <Text
                          fontFamily="$mono"
                          fontSize={11}
                          color="$textMuted"
                        >
                          {p.primaryEra}
                        </Text>
                      ) : null}
                    </YStack>
                    <YStack width={POS_COL_WIDTH}>
                      {primaryPos ? (
                        <Text
                          fontSize={10}
                          fontWeight="700"
                          color={posColor(primaryPos)}
                        >
                          {primaryPos}
                        </Text>
                      ) : (
                        <Text fontSize={12} color="$textMuted">
                          —
                        </Text>
                      )}
                    </YStack>
                    {cols.map((c) => (
                      <Text
                        key={c.id}
                        width={COL_WIDTH}
                        textAlign="right"
                        fontFamily="$mono"
                        fontSize={12}
                        fontWeight={c.bold ? '700' : '400'}
                        color={c.bold ? '$color' : '$color11'}
                        {...TABULAR_NUMS}
                      >
                        {renderCell(p, c)}
                      </Text>
                    ))}
                    <XStack width={ACTION_COL_WIDTH} justifyContent="flex-end">
                      {canClaim && renderClaimAction ? (
                        renderClaimAction({
                          id: playerId,
                          firstName: p.firstName,
                          lastName: p.lastName,
                          eligiblePositions: p.eligiblePositions,
                        })
                      ) : (
                        <Text
                          fontSize={11}
                          fontWeight="600"
                          color="$textMuted"
                          paddingHorizontal="$2"
                          paddingVertical="$1"
                        >
                          {isMember ? 'Join Team' : 'Spectator'}
                        </Text>
                      )}
                    </XStack>
                  </XStack>
                );
              })}

              {!isLoading && players.length === 0 ? (
                <YStack padding="$6" alignItems="center" gap="$1">
                  <Text fontWeight="700" color="$color">
                    No players found
                  </Text>
                  <Text color="$textMuted" fontSize={12}>
                    Try adjusting your search or position filter.
                  </Text>
                </YStack>
              ) : null}
              {isLoading && players.length === 0 ? (
                <YStack padding="$6" alignItems="center">
                  <Text color="$textMuted">Loading free agents…</Text>
                </YStack>
              ) : null}
            </YStack>
          </ScrollView>

          {/* Pagination */}
          <XStack alignItems="center" justifyContent="space-between">
            <Text fontSize={12} color="$textMuted">
              {players.length > 0
                ? `Showing ${page * PAGE_SIZE + 1}–${
                    page * PAGE_SIZE + players.length
                  }`
                : 'No results'}
            </Text>
            <XStack gap="$2">
              <PageButton
                disabled={page === 0}
                label="Previous page"
                onPress={() => setPage((n) => Math.max(0, n - 1))}
                icon={<ChevronLeft size={16} color="$color" />}
              />
              <PageButton
                disabled={!hasNextPage}
                label="Next page"
                onPress={() => setPage((n) => n + 1)}
                icon={<ChevronRight size={16} color="$color" />}
              />
            </XStack>
          </XStack>
        </YStack>
      </YStack>
    </ScrollView>
  );
};

const HeaderCell: React.FC<{
  children?: React.ReactNode;
  width: number;
  align?: 'left' | 'right';
  testID?: string;
}> = ({ children, width, align = 'left', testID }) => (
  <Text
    testID={testID}
    width={width}
    fontFamily="$heading"
    fontWeight="700"
    fontSize={10}
    letterSpacing={1.0}
    textTransform="uppercase"
    color="$textMuted"
    textAlign={align}
  >
    {children}
  </Text>
);

const PageButton: React.FC<{
  disabled: boolean;
  label: string;
  onPress: () => void;
  icon: React.ReactNode;
}> = ({ disabled, label, onPress, icon }) => (
  <XStack
    onPress={disabled ? undefined : onPress}
    tabIndex={disabled ? -1 : 0}
    onKeyDown={disabled ? undefined : keyActivate(onPress)}
    width={32}
    height={32}
    alignItems="center"
    justifyContent="center"
    borderRadius="$3"
    borderWidth={1}
    borderColor="$surfacePanelBorder"
    backgroundColor="$surfaceCard"
    opacity={disabled ? 0.4 : 1}
    pressStyle={disabled ? undefined : { opacity: 0.7 }}
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled }}
    cursor={disabled ? 'default' : 'pointer'}
  >
    {icon}
  </XStack>
);
