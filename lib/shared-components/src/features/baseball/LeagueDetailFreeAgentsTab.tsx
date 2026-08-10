import React, { useEffect, useMemo, useState } from 'react';
import { Input, ScrollView, Text, XStack, YStack } from 'tamagui';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Eye,
  Info,
  Search,
} from '@tamagui/lucide-icons';
import { useApolloClient } from '@apollo/client/react';
import { LOGGER } from '@legacy-sports/logging';
import {
  type FootballPlayerHeaderFragment,
  type GetPlayersWithStatsQuery,
  GetTeamMembers,
  type GetTeamMembersQuery,
  type GetTeamMembersQueryVariables,
  useFootballPlayersQuery,
  useGetLeagueTeamsQuery,
  useGetPlayersWithStatsQuery,
} from '@legacy-sports/graphql';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED_LIGHT,
  getPositionColor,
  GREEN_LIGHT,
  SLATE_400,
  withAlpha,
} from '../../utils/colors';
import { TABULAR_NUMS } from '../../utils/typography';

/**
 * Cross-platform Free Agents tab for the league-detail screen (LS-7818,
 * LS-9098).
 *
 * Web is canonical (epic LS-7708, principle LS-7790): this component is a
 * tamagui port of the web v2 `FreeAgentsTab`. It owns the paginated player
 * pool, position + name filters, the full stat column set, and the
 * spectator/member banners. Grouping is sport-conditional on `league.sport`:
 * baseball renders the hitters/pitchers toggle (LS-7818); football renders
 * QB/RB/WR/TE/K/DST position-group filters — plus IDP DL/LB/DB when
 * `league.defensiveFormat === 'idp'` — and a sort-by-projection control, per
 * the Free Agents / Waivers feature spec (LS-5417, LS-9098 / FLD-002). The
 * actual waiver-claim UI is abstracted behind the `renderClaimAction`
 * callback so each platform supplies its own flow (web: a button that opens
 * `WaiverClaimModal`; native: an inline FAAB claim cluster). Both consumers
 * render the same list, filters, columns, and banners — parity by
 * construction.
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
  /** Only meaningful for football leagues (LS-246). */
  defensiveFormat?: 'dst' | 'idp' | null;
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

/** Football position-group filters (LS-9098 / FLD-002). */
const FOOTBALL_OFFENSE_POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DST'];
const FOOTBALL_IDP_POSITIONS = ['DL', 'LB', 'DB'];

type FootballPlayer = FootballPlayerHeaderFragment;
type SortDir = 'asc' | 'desc';

interface FootballCol {
  id: string;
  label: string;
  bold?: boolean;
}

const FOOTBALL_COLS: FootballCol[] = [
  { id: 'TEAM', label: 'Team' },
  { id: 'PROJ', label: 'Proj', bold: true },
];

const renderFootballCell = (p: FootballPlayer, col: FootballCol): string => {
  switch (col.id) {
    case 'TEAM':
      return p.nflTeam ?? (p.isDst ? '—' : 'FA');
    case 'PROJ':
      return fmtF1(p.projectedFantasyPoints);
    default:
      return '—';
  }
};

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

const playerName = (p: {
  firstName?: string | null;
  lastName?: string | null;
}): string =>
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
 * filtered out of the free-agent pool. Keyed on leagueId only — the
 * taken-player set is league-wide and does not depend on the active filter or
 * page (LS-5923). Pass `refreshKey` only when you need to force a re-pull
 * (e.g. after a successful waiver claim). Ported from the web
 * `useLeagueTakenPlayers` hook.
 */
function useLeagueTakenPlayers(
  leagueId: number,
  refreshKey?: unknown,
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
}> = ({ label, active, onPress, testID }) => {
  const ariaLabel =
    label === 'ALL' ? 'All positions' : `Filter by position: ${label}`;
  return (
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
      aria-pressed={active}
      aria-label={ariaLabel}
    >
      {label}
    </Text>
  );
};

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
    aria-pressed={active}
  >
    {label}
  </Text>
);

/**
 * Cycles null → desc → asc → null so every state (including "off", the
 * server's default order) is reachable from one control (LS-9098).
 */
const nextSortDir = (current: SortDir | null): SortDir | null => {
  if (current == null) return 'desc';
  if (current === 'desc') return 'asc';
  return null;
};

/** Sort-by-projection control for the football free-agent pool (LS-9098 / LS-5417). */
const ProjectionSortToggle: React.FC<{
  value: SortDir | null;
  onChange: (next: SortDir | null) => void;
}> = ({ value, onChange }) => {
  const activate = () => onChange(nextSortDir(value));
  const ariaLabel =
    value == null
      ? 'Sort by projection'
      : `Sort by projection, ${value === 'asc' ? 'ascending' : 'descending'}`;
  return (
    <XStack
      testID="sort-by-projection"
      onPress={activate}
      tabIndex={0}
      onKeyDown={keyActivate(activate)}
      alignItems="center"
      gap="$1"
      paddingHorizontal="$3"
      paddingVertical="$1.5"
      borderRadius="$3"
      borderWidth={1}
      borderColor={value != null ? '$brandNavy' : '$surfacePanelBorder'}
      backgroundColor={value != null ? '$brandNavy' : '$surfaceCard'}
      pressStyle={{ opacity: 0.7 }}
      accessibilityRole="button"
      accessibilityLabel={ariaLabel}
      aria-pressed={value != null}
    >
      <Text
        fontSize={12}
        fontWeight={value != null ? '700' : '500'}
        fontFamily="$heading"
        letterSpacing={0.4}
        color={value != null ? 'white' : '$textMuted'}
      >
        Projection
      </Text>
      {value === 'asc' ? (
        <ArrowUp size={12} color="white" />
      ) : value === 'desc' ? (
        <ArrowDown size={12} color="white" />
      ) : null}
    </XStack>
  );
};

interface PlayerRowProps {
  p: PlayerWithStats;
  playerId: number;
  cols: StatCol[];
  group: Group;
  gamesPerMatchup: number;
  canClaim: boolean;
  isMember: boolean;
  renderClaimAction?: (player: FreeAgentClaimPlayer) => React.ReactNode;
}

const renderCell = (
  p: PlayerWithStats,
  col: StatCol,
  group: Group,
  gamesPerMatchup: number,
): string => {
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

const PlayerRow = React.memo<PlayerRowProps>(function PlayerRow({
  p,
  playerId,
  cols,
  group,
  gamesPerMatchup,
  canClaim,
  isMember,
  renderClaimAction,
}) {
  const primaryPos = p.eligiblePositions?.[0] ?? null;
  return (
    <XStack
      paddingVertical="$2"
      alignItems="center"
      borderBottomWidth={1}
      borderBottomColor="$outlineSubtle"
    >
      <YStack width={PLAYER_COL_WIDTH} paddingRight="$2">
        <Text fontWeight="600" fontSize={13} color="$color" numberOfLines={1}>
          {playerName(p)}
        </Text>
        {p.primaryEra != null ? (
          <Text fontFamily="$mono" fontSize={11} color="$textMuted">
            {p.primaryEra}
          </Text>
        ) : null}
      </YStack>
      <YStack width={POS_COL_WIDTH}>
        {primaryPos ? (
          <Text fontSize={10} fontWeight="700" color={posColor(primaryPos)}>
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
          {renderCell(p, c, group, gamesPerMatchup)}
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
});

interface FootballPlayerRowProps {
  p: FootballPlayer;
  canClaim: boolean;
  isMember: boolean;
  renderClaimAction?: (player: FreeAgentClaimPlayer) => React.ReactNode;
}

const FootballPlayerRow = React.memo<FootballPlayerRowProps>(
  function FootballPlayerRow({ p, canClaim, isMember, renderClaimAction }) {
    const primaryPos = p.isDst ? 'DST' : (p.position ?? null);
    return (
      <XStack
        paddingVertical="$2"
        alignItems="center"
        borderBottomWidth={1}
        borderBottomColor="$outlineSubtle"
      >
        <YStack width={PLAYER_COL_WIDTH} paddingRight="$2">
          <Text fontWeight="600" fontSize={13} color="$color" numberOfLines={1}>
            {playerName(p)}
          </Text>
        </YStack>
        <YStack width={POS_COL_WIDTH}>
          {primaryPos ? (
            <Text
              fontSize={10}
              fontWeight="700"
              color={getPositionColor('football', primaryPos)}
            >
              {primaryPos}
            </Text>
          ) : (
            <Text fontSize={12} color="$textMuted">
              —
            </Text>
          )}
        </YStack>
        {FOOTBALL_COLS.map((c) => (
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
            {renderFootballCell(p, c)}
          </Text>
        ))}
        <XStack width={ACTION_COL_WIDTH} justifyContent="flex-end">
          {canClaim && renderClaimAction ? (
            renderClaimAction({
              id: p.id,
              firstName: p.firstName,
              lastName: p.lastName,
              eligiblePositions: primaryPos ? [primaryPos] : null,
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
  },
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

  // Football: position-group filter (replaces the hitters/pitchers toggle)
  // and the sort-by-projection control (LS-9098 / LS-5417). IDP DL/LB/DB
  // pills only appear for leagues whose commissioner opted into individual
  // defensive-player scoring (league.defensiveFormat === 'idp'); everyone
  // else fields a single DST unit, matching the roster's defensive slot.
  const isIdpLeague = league.defensiveFormat === 'idp';
  const footballPositionOptions = isIdpLeague
    ? [...FOOTBALL_OFFENSE_POSITIONS, ...FOOTBALL_IDP_POSITIONS]
    : FOOTBALL_OFFENSE_POSITIONS;
  const [footballPos, setFootballPos] = useState<string>('ALL');
  const [footballSortDir, setFootballSortDir] = useState<SortDir | null>(null);
  // Cursor-paginated (footballPlayers uses an opaque `after` cursor, not
  // offset/limit like GetPlayersWithStats) — the stack of cursors visited so
  // far lets Previous walk back without re-querying from page 1.
  const [footballCursors, setFootballCursors] = useState<
    Array<string | undefined>
  >([undefined]);
  const [footballCursorIndex, setFootballCursorIndex] = useState(0);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    setFootballCursors([undefined]);
    setFootballCursorIndex(0);
  }, [footballPos, debouncedSearch]);

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
      limit: PAGE_SIZE + 1,
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

  const {
    data: footballData,
    loading: footballLoading,
    error: footballError,
  } = useFootballPlayersQuery({
    variables: {
      positions: footballPos === 'ALL' ? undefined : [footballPos],
      search: debouncedSearch || undefined,
      after: footballCursors[footballCursorIndex],
      first: PAGE_SIZE,
    },
    skip: !isFootball,
    fetchPolicy: 'cache-and-network',
  });

  const { takenPlayerIds, loading: takenLoading } =
    useLeagueTakenPlayers(leagueId);

  const hasNextPage = (data?.players ?? []).length > PAGE_SIZE;
  const footballHasNextPage =
    footballData?.footballPlayers?.pageInfo?.hasNextPage ?? false;

  const players = useMemo(
    () =>
      (data?.players ?? [])
        .slice(0, PAGE_SIZE)
        .filter(
          (p): p is PlayerWithStats =>
            p?.id != null && !takenPlayerIds.has(p.id),
        ),
    [data?.players, takenPlayerIds],
  );

  // The `fpts`/`fpg` pool sorts (LS-9071) rank career totals server-side, not
  // this-season projections — footballPlayers has no server-side sort for
  // `projectedFantasyPoints` yet, so the projection sort re-orders the
  // already-fetched page client-side rather than the whole pool.
  const footballPlayers = useMemo(() => {
    const filtered = (footballData?.footballPlayers?.nodes ?? []).filter(
      (p): p is FootballPlayer => p?.id != null && !takenPlayerIds.has(p.id),
    );
    if (footballSortDir == null) return filtered;
    const dir = footballSortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a.projectedFantasyPoints ?? -Infinity;
      const bv = b.projectedFantasyPoints ?? -Infinity;
      return (av - bv) * dir;
    });
  }, [footballData?.footballPlayers?.nodes, takenPlayerIds, footballSortDir]);

  const cols = group === 'pitchers' ? PITCHER_COLS : HITTER_COLS;
  const positions = group === 'pitchers' ? PITCHER_POSITIONS : HITTER_POSITIONS;
  const isLoading = loading || takenLoading;
  const footballIsLoading = footballLoading || takenLoading;
  const canClaim = isMember && myTeamId != null;
  const subTitle = league.waiverEnabled
    ? `${league.waiverType ?? 'Waivers'} active${
        league.faabBudgetDefault ? ` · FAAB ${league.faabBudgetDefault}` : ''
      }`
    : 'Available players in the league pool';

  if (isFootball) {
    if (footballError) {
      return (
        <PlaceholderCard
          role="alert"
          title="Unable to load players"
          body="Refresh to try again."
        />
      );
    }

    const footballTableMinWidth =
      PLAYER_COL_WIDTH +
      POS_COL_WIDTH +
      FOOTBALL_COLS.length * COL_WIDTH +
      ACTION_COL_WIDTH;

    const handleFootballNext = () => {
      const endCursor = footballData?.footballPlayers?.pageInfo?.endCursor;
      setFootballCursors((prev) => [
        ...prev.slice(0, footballCursorIndex + 1),
        endCursor ?? undefined,
      ]);
      setFootballCursorIndex((n) => n + 1);
    };
    const handleFootballPrev = () => {
      setFootballCursorIndex((n) => Math.max(0, n - 1));
    };

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
            {/* Header: title + sort-by-projection control */}
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
              <ProjectionSortToggle
                value={footballSortDir}
                onChange={setFootballSortDir}
              />
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

            {/* Position-group filters (QB/RB/WR/TE/K/DST, + IDP DL/LB/DB) */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
            >
              <XStack gap="$1.5" role="group" aria-label="Position filter">
                {footballPositionOptions.map((p) => (
                  <FilterPill
                    key={p}
                    label={p}
                    active={footballPos === p}
                    testID={`position-filter-${p}`}
                    onPress={() => setFootballPos(p)}
                  />
                ))}
              </XStack>
            </ScrollView>

            {/* Table */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <YStack minWidth={footballTableMinWidth} width="100%">
                <XStack
                  paddingVertical="$2"
                  borderBottomWidth={1}
                  borderBottomColor="$outlineStrong"
                  alignItems="center"
                >
                  <HeaderCell width={PLAYER_COL_WIDTH}>Player</HeaderCell>
                  <HeaderCell width={POS_COL_WIDTH}>Pos</HeaderCell>
                  {FOOTBALL_COLS.map((c) => (
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

                {footballPlayers.map((p) =>
                  p?.id != null ? (
                    <FootballPlayerRow
                      key={p.id}
                      p={p}
                      canClaim={canClaim}
                      isMember={isMember}
                      renderClaimAction={renderClaimAction}
                    />
                  ) : null,
                )}

                {!footballIsLoading && footballPlayers.length === 0 ? (
                  <YStack padding="$6" alignItems="center" gap="$1">
                    <Text fontWeight="700" color="$color">
                      No players found
                    </Text>
                    <Text color="$textMuted" fontSize={12}>
                      Try adjusting your search or position filter.
                    </Text>
                  </YStack>
                ) : null}
                {footballIsLoading && footballPlayers.length === 0 ? (
                  <YStack padding="$6" alignItems="center">
                    <Text color="$textMuted">Loading free agents…</Text>
                  </YStack>
                ) : null}
              </YStack>
            </ScrollView>

            {/* Pagination */}
            <XStack alignItems="center" justifyContent="space-between">
              <Text fontSize={12} color="$textMuted">
                {footballPlayers.length > 0
                  ? `Showing ${footballPlayers.length} players`
                  : 'No results'}
              </Text>
              <XStack gap="$2">
                <PageButton
                  disabled={footballCursorIndex === 0}
                  label="Previous page"
                  onPress={handleFootballPrev}
                  icon={<ChevronLeft size={16} color="$color" />}
                />
                <PageButton
                  disabled={!footballHasNextPage}
                  label="Next page"
                  onPress={handleFootballNext}
                  icon={<ChevronRight size={16} color="$color" />}
                />
              </XStack>
            </XStack>
          </YStack>
        </YStack>
      </ScrollView>
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
            <XStack gap="$1.5" role="group" aria-label="Position filter">
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

              {/* Body rows — memoized to avoid re-renders while search is debouncing */}
              {players.map((p) =>
                p?.id != null ? (
                  <PlayerRow
                    key={p.id}
                    p={p}
                    playerId={p.id}
                    cols={cols}
                    group={group}
                    gamesPerMatchup={gamesPerMatchup}
                    canClaim={canClaim}
                    isMember={isMember}
                    renderClaimAction={renderClaimAction}
                  />
                ) : null,
              )}

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
