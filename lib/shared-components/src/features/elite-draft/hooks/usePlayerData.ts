import { useMemo, useRef } from 'react';
import type {
  AvailableDraftPlayer,
  DraftPickRecord,
  DraftPlayer,
  PlayerFootballStatsEntry,
  PlayerStatsEntry,
} from '../types';
import type { SportKind } from '../../../config/sports';

const PITCHER_POSITIONS = new Set(['P', 'SP', 'RP']);
const OUTFIELD_POSITIONS = new Set(['OF', 'CF', 'LF', 'RF']);

export const isPitcherPosition = (pos: string): boolean =>
  PITCHER_POSITIONS.has(pos.toUpperCase());

/**
 * Football stat fields for a DraftPlayer (LS-9478). Every field stays
 * undefined — never defaults to 0 — when the player has no entry in
 * footballStatsMap (no career row in any of the four source tables) so the
 * board renders an em-dash instead of repeating the LS-9473 fabricated-zero
 * defect (`?? 0` on an unmeasured stat).
 *
 * `td` is the board's generic TD column: rushTd + recTd. Passing TDs are
 * excluded (already implied by passYds for QBs, per the LS-9478 field-mapping
 * decision) — it stays undefined only when the player has neither a rushing
 * nor a receiving row, not when both are a measured 0.
 */
function footballStatFields(
  stats: PlayerFootballStatsEntry | undefined,
): Pick<
  DraftPlayer,
  'passYds' | 'passTd' | 'rushYds' | 'rushTd' | 'rec' | 'recTd' | 'td' | 'fg'
> {
  const hasRushOrRecTd = stats?.rushTd != null || stats?.recTd != null;
  return {
    passYds: stats?.passYds,
    passTd: stats?.passTd,
    rushYds: stats?.rushYds,
    rushTd: stats?.rushTd,
    rec: stats?.rec,
    recTd: stats?.recTd,
    td: hasRushOrRecTd ? (stats?.rushTd ?? 0) + (stats?.recTd ?? 0) : undefined,
    fg: stats?.fg,
  };
}

interface PitchingStats {
  wins: number;
  losses: number;
  era: number;
  strikeouts: number;
  saves: number;
  games: number;
  gamesStarted: number;
  whip: number;
  winPct: number;
}

/**
 * Whether a player gets the pitcher card. Shared by the live board and the
 * completed-draft lookup so both pick the same stat set (LS-10508): any
 * pitcher-eligible position (authoritative, from player_eligible_positions)
 * first, then pitchingStatsMap presence, then position — covers pure pitchers
 * that are absent from playerStatsMap (no career batting row) (LS-3115).
 */
function resolveIsPitcher(
  playerId: number,
  eligiblePositions: readonly string[] | null | undefined,
  position: string,
  pitchingStatsMap: Map<number, PitchingStats>,
): boolean {
  return (
    (eligiblePositions?.some(isPitcherPosition) ?? false) ||
    pitchingStatsMap.has(playerId) ||
    isPitcherPosition(position)
  );
}

/**
 * Baseball stat fields for a DraftPlayer card. `isPitcher` drives which set
 * BaseballCard / PlayerCard render, and pitchers carry the full pitching line
 * (ERA / W / K / WHIP …) — the same fields on every path that builds a card,
 * so a completed-draft result card matches the live one (LS-10508).
 */
function baseballStatFields(
  stats: PlayerStatsEntry | undefined,
  pitching: PitchingStats | undefined,
  pitcher: boolean,
): Pick<
  DraftPlayer,
  | 'avg'
  | 'hr'
  | 'rbi'
  | 'runs'
  | 'sb'
  | 'games'
  | 'hits'
  | 'obp'
  | 'slg'
  | 'isPitcher'
  | 'wins'
  | 'losses'
  | 'era'
  | 'strikeouts'
  | 'saves'
  | 'whip'
  | 'winPct'
  | 'gamesStarted'
> {
  const ps = pitcher ? pitching : undefined;
  return {
    avg: stats?.avg ?? 0,
    hr: stats?.hr ?? 0,
    rbi: stats?.rbi ?? 0,
    runs: stats?.runs ?? 0,
    sb: stats?.sb ?? 0,
    games: ps?.games ?? stats?.games ?? 0,
    hits: stats?.hits ?? 0,
    obp: stats?.obp ?? 0,
    slg: stats?.slg ?? 0,
    isPitcher: pitcher,
    wins: ps?.wins,
    losses: ps?.losses,
    era: ps?.era,
    strikeouts: ps?.strikeouts,
    saves: ps?.saves,
    whip: ps?.whip,
    winPct: ps?.winPct,
    gamesStarted: ps?.gamesStarted,
  };
}

interface UsePlayerDataParams {
  availablePlayers: AvailableDraftPlayer[];
  pickHistory: DraftPickRecord[];
  playerStatsMap: Map<number, PlayerStatsEntry>;
  pitchingStatsMap: Map<number, PitchingStats>;
  myTeamId: number | null;
  /** League sport (LS-9478). Defaults to 'baseball' so existing callers that
   * don't yet pass a sport (e.g. the spectator room) are unaffected. */
  sport?: SportKind;
  /** Football stat lookup (LS-9478), keyed by player id. Ignored when sport
   * is not 'football'. Defaults to an empty map. */
  footballStatsMap?: Map<number, PlayerFootballStatsEntry>;
}

const EMPTY_FOOTBALL_STATS_MAP: Map<number, PlayerFootballStatsEntry> =
  new Map();

export function usePlayerData({
  availablePlayers,
  pickHistory,
  playerStatsMap,
  pitchingStatsMap,
  myTeamId,
  sport = 'baseball',
  footballStatsMap = EMPTY_FOOTBALL_STATS_MAP,
}: UsePlayerDataParams) {
  const isFootball = sport === 'football';
  // Last-seen projectedMatchupPoints per player id (LS-10473). The server
  // drops a player from availablePlayers the moment they are drafted, and
  // availablePlayers is the only source of a projection — so without this,
  // every drafted player's ppg went missing and the draft recap's PROJ PTS
  // total read 0.0 once the draft completed. Only ever grows, and only when
  // availablePlayers changes, which already recomputes statsLookup below.
  const lastKnownPpgRef = useRef(new Map<number, number | null>());
  // Build a lookup map by player ID for displaying player names in history/board
  const statsLookup = useMemo(() => {
    const lastKnownPpg = lastKnownPpgRef.current;
    for (const ap of availablePlayers) {
      lastKnownPpg.set(ap.id, ap.projectedMatchupPoints ?? null);
    }
    const map = new Map<number, DraftPlayer>();
    // Seed from playerStatsMap
    for (const [pid, s] of playerStatsMap) {
      map.set(pid, {
        id: pid,
        name:
          `${s.firstName} ${s.lastName}`.trim() ||
          `Unknown Player (ID: ${pid})`,
        position: s.position,
        ...baseballStatFields(
          s,
          pitchingStatsMap.get(pid),
          isPitcherPosition(s.position),
        ),
      });
    }
    // Override with available players (authoritative firstName/lastName)
    for (const ap of availablePlayers) {
      const s = playerStatsMap.get(ap.id);
      // primaryPosition is no longer fetched in GetDraftPlayerStats to avoid
      // expensive DataLoader calls that caused 502s (LS-3113). Derive position
      // from eligiblePositions (authoritative, from player_eligible_positions
      // materialized view) and fall back to the stats entry when absent.
      const pos = ap.eligiblePositions?.[0] ?? s?.position ?? 'UTIL';
      const pitcher = resolveIsPitcher(
        ap.id,
        ap.eligiblePositions,
        pos,
        pitchingStatsMap,
      );
      map.set(ap.id, {
        id: ap.id,
        name: `${ap.firstName} ${ap.lastName}`.trim(),
        position: pos,
        eligiblePositions: ap.eligiblePositions ?? undefined,
        ...baseballStatFields(s, pitchingStatsMap.get(ap.id), pitcher),
        ppg: ap.projectedMatchupPoints ?? null,
        adp: ap.adp ?? null,
        club: ap.club ?? null,
        ...footballStatFields(
          isFootball ? footballStatsMap.get(ap.id) : undefined,
        ),
      });
    }
    // Seed from pick history for drafted players absent from stats, and fix
    // position for players seeded from playerStatsMap whose position is 'UTIL'
    // (playerStatsMap hardcodes position as 'UTIL' since primaryPosition was
    // removed from GetDraftPlayerStats to avoid expensive DataLoader calls —
    // LS-3113, LS-3647).
    for (const pick of pickHistory) {
      if (!pick.player) continue;
      const name = `${pick.player.firstName} ${pick.player.lastName}`.trim();
      if (!name) continue;
      const ps = pitchingStatsMap.get(pick.playerId);
      const eligible = pick.player.eligiblePositions?.length
        ? pick.player.eligiblePositions
        : undefined;
      // Football 'P' is a punter, not a pitcher — never the pitcher card.
      const pitcherAt = (position: string) =>
        !isFootball &&
        resolveIsPitcher(pick.playerId, eligible, position, pitchingStatsMap);
      const existing = map.get(pick.playerId);
      if (!existing) {
        // Player has no batting stats (e.g. pure pitcher) — add entry
        const position =
          eligible?.[0] ??
          (ps ? (ps.gamesStarted >= ps.games / 2 ? 'SP' : 'RP') : 'P');
        map.set(pick.playerId, {
          id: pick.playerId,
          name,
          position,
          eligiblePositions: eligible,
          club: pick.player.club ?? null,
          ...baseballStatFields(undefined, ps, pitcherAt(position)),
          ...footballStatFields(
            isFootball ? footballStatsMap.get(pick.playerId) : undefined,
          ),
        });
      } else if (existing.position === 'UTIL') {
        // Player is in map from playerStatsMap with hardcoded 'UTIL' — patch
        // position and eligiblePositions using the authoritative server data,
        // and re-derive the stat set so a drafted pitcher with a career
        // batting row gets the pitcher card, not batting zeros (LS-10508).
        const position = eligible?.[0] ?? existing.position;
        map.set(pick.playerId, {
          ...existing,
          position,
          eligiblePositions: eligible ?? existing.eligiblePositions,
          ...baseballStatFields(
            playerStatsMap.get(pick.playerId),
            ps,
            pitcherAt(position),
          ),
        });
      }
    }
    // Restore the projection for players no longer in availablePlayers
    // (drafted) — the entries seeded above from playerStatsMap / pickHistory
    // carry no ppg of their own.
    for (const [pid, player] of map) {
      if (player.ppg === undefined && lastKnownPpg.has(pid)) {
        map.set(pid, { ...player, ppg: lastKnownPpg.get(pid) });
      }
    }
    return map;
  }, [
    availablePlayers,
    pickHistory,
    playerStatsMap,
    pitchingStatsMap,
    isFootball,
    footballStatsMap,
  ]);

  // Merge available players with stats for rich card display
  const enrichedPlayers: DraftPlayer[] = useMemo(() => {
    return availablePlayers.map((ap) => {
      const s = playerStatsMap.get(ap.id);
      // Derive position from eligiblePositions (authoritative) since primaryPosition
      // is no longer fetched in GetDraftPlayerStats (LS-3113).
      const pos = ap.eligiblePositions?.[0] ?? s?.position ?? 'UTIL';
      const pitcher = resolveIsPitcher(
        ap.id,
        ap.eligiblePositions,
        pos,
        pitchingStatsMap,
      );
      return {
        id: ap.id,
        name: `${ap.firstName} ${ap.lastName}`.trim(),
        position: pos,
        eligiblePositions: ap.eligiblePositions ?? undefined,
        ...baseballStatFields(s, pitchingStatsMap.get(ap.id), pitcher),
        ppg: ap.projectedMatchupPoints ?? null,
        adp: ap.adp ?? null,
        club: ap.club ?? null,
        ...footballStatFields(
          isFootball ? footballStatsMap.get(ap.id) : undefined,
        ),
      };
    });
  }, [
    availablePlayers,
    playerStatsMap,
    pitchingStatsMap,
    isFootball,
    footballStatsMap,
  ]);

  // My team picks from history
  const myTeamPicks = useMemo(
    () => pickHistory.filter((p) => p.teamId === myTeamId),
    [pickHistory, myTeamId],
  );

  // My drafted players mapped to DraftPlayer for roster display
  const myTeam: DraftPlayer[] = useMemo(
    () =>
      myTeamPicks.map((pick) => {
        const player = statsLookup.get(pick.playerId);
        if (player) return player;
        return {
          id: pick.playerId,
          name: `Unknown Player (ID: ${pick.playerId})`,
          position: 'UTIL',
          avg: 0,
          hr: 0,
          rbi: 0,
          runs: 0,
          sb: 0,
          games: 0,
          hits: 0,
          obp: 0,
          slg: 0,
        };
      }),
    [myTeamPicks, statsLookup],
  );

  const positionCounts = useMemo(
    () =>
      myTeam.reduce<Record<string, number>>((acc, p) => {
        const key = OUTFIELD_POSITIONS.has(p.position)
          ? 'OF'
          : PITCHER_POSITIONS.has(p.position)
            ? 'P'
            : p.position;
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {}),
    [myTeam],
  );

  return {
    statsLookup,
    enrichedPlayers,
    myTeamPicks,
    myTeam,
    positionCounts,
  } as const;
}
